"use client";

import { useEffect, useRef, useState } from "react";
import { BuildWorkspace } from "./workspace";
import { useSearchParams } from "next/navigation";
import {
  MockPromptStudioAdapter,
  PromptStudioDraftSchema,
  compileStudioInstructions,
  createStudioReview,
  sanitizeStudioDraft,
  type PromptStudioDraft,
} from "@buildwise/shared";

type Speech = {
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
};
const sample =
  "Build a booking portal for independent fitness coaches. Clients should browse sessions, book a place, and see their upcoming bookings. Coaches should manage availability.";
const field = "studio-field";
const button = "studio-button";
function StudioIcon({ name }: { name: "arrow" | "mic" | "spark" | "check" | "code" | "leaf" }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {name === "arrow" ? (
        <>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </>
      ) : name === "mic" ? (
        <>
          <rect x="9" y="2" width="6" height="13" rx="3" />
          <path d="M5 10v2a7 7 0 0014 0v-2M12 19v3M8 22h8" />
        </>
      ) : name === "check" ? (
        <path d="m5 12 4 4L19 6" />
      ) : name === "code" ? (
        <path d="m8 6-6 6 6 6m8-12 6 6-6 6m-3-15-6 18" />
      ) : name === "leaf" ? (
        <>
          <path d="M20 3C9 2 3 7 5 15c7 5 15-1 15-12Z" />
          <path d="M3 21 16 8" />
        </>
      ) : (
        <>
          <path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z" />
        </>
      )}
    </svg>
  );
}

export function PromptStudio({ demo = false }: { demo?: boolean }) {
  const params = useSearchParams();
  const [idea, setIdea] = useState("");
  const [draft, setDraft] = useState<PromptStudioDraft | null>(null);
  const [specText, setSpecText] = useState("");
  const [session, setSession] = useState<{ id: string; revision: number } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"brief" | "prompt" | "schema">("brief");
  const [confirmed, setConfirmed] = useState(false);
  const [listening, setListening] = useState(false);
  const speech = useRef<Speech | null>(null);
  const loadId = params.get("session");
  useEffect(() => {
    if (!loadId || demo) return;
    const controller = new AbortController();
    fetch(`/api/prompt-studio/sessions/${encodeURIComponent(loadId)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        const loaded = PromptStudioDraftSchema.parse(data.draft);
        setDraft(loaded);
        setIdea(loaded.input.idea);
        setSpecText(JSON.stringify(loaded.spec, null, 2));
        setSession({ id: data.id, revision: data.revision });
        setNotice(`Loaded saved version ${data.revision}.`);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [loadId, demo]);
  useEffect(() => () => speech.current?.stop(), []);
  function change(next: PromptStudioDraft) {
    setDraft(next);
    setConfirmed(false);
    setNotice("Unsaved changes");
  }
  async function interpret() {
    setError("");
    setBusy(true);
    try {
      const next = sanitizeStudioDraft(
        await new MockPromptStudioAdapter().interpret({ idea, links: [] }),
      );
      setDraft(next);
      setSpecText(JSON.stringify(next.spec, null, 2));
      setSession(null);
      setConfirmed(false);
      setNotice("Mock scaffold created. Review all suggestions; no model was called.");
    } catch {
      setError(
        "Describe your idea in 50–2,000 characters. Remove sensitive details before continuing.",
      );
    } finally {
      setBusy(false);
    }
  }
  function dictate() {
    const host = window as unknown as {
      SpeechRecognition?: new () => Speech;
      webkitSpeechRecognition?: new () => Speech;
    };
    const Constructor = host.SpeechRecognition ?? host.webkitSpeechRecognition;
    if (!Constructor) {
      setError("Voice is unavailable in this browser. You can type or paste a transcript.");
      return;
    }
    if (listening) {
      speech.current?.stop();
      return;
    }
    const recognition = new Constructor();
    speech.current = recognition;
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (e) =>
      setIdea((old) => (old + " " + e.results[0][0].transcript).trim().slice(0, 2000));
    recognition.onerror = () => {
      setError("Microphone access or transcription failed. Please type your idea.");
      setListening(false);
    };
    recognition.onend = () => setListening(false);
    try {
      recognition.start();
      setListening(true);
    } catch {
      setError("Could not start voice input.");
    }
  }
  async function save(review = false) {
    if (!draft) return;
    setBusy(true);
    setError("");
    try {
      const clean = sanitizeStudioDraft(draft);
      if (review) createStudioReview(clean);
      if (demo) {
        setNotice("Demo only: use Export JSON to keep this brief. Sign in to save versions.");
        return;
      }
      const id = session?.id ?? crypto.randomUUID();
      const response = await fetch(`/api/prompt-studio/sessions${session ? `/${id}` : ""}`, {
        method: session ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          mutationId: crypto.randomUUID(),
          expectedRevision: session?.revision ?? 0,
          draft: clean,
          status: review ? "user_reviewed" : "draft",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setDraft(PromptStudioDraftSchema.parse(data.draft));
      setSession({ id, revision: data.revision });
      window.history.replaceState(null, "", `?session=${id}`);
      setNotice(
        `Version ${data.revision} saved${review ? " and marked user reviewed" : ""}. No build or paid execution started.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save. Export your edits to keep them.");
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!draft) return;
    try {
      const clean = sanitizeStudioDraft(draft);
      const payload = confirmed ? createStudioReview(clean) : clean;
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = "conduit-prompt-brief.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the brief before exporting.");
    }
  }
  const parsed = draft ? PromptStudioDraftSchema.safeParse(draft) : null;
  let instructionPreview = "Complete the brief fields to preview valid instructions.";
  if (parsed?.success) {
    try {
      instructionPreview = compileStudioInstructions(sanitizeStudioDraft(parsed.data));
    } catch {
      instructionPreview =
        "After masking sensitive information, some fields need more detail. Update the brief before saving.";
    }
  }
  const ready = !!parsed?.success && !!draft && draft.questions.every((q) => q.answer?.trim());
  const composer = (
    <>
      <label htmlFor="idea" className="sr-only">
        Describe your product
      </label>
      <textarea
        id="idea"
        value={idea}
        maxLength={2000}
        onChange={(e) => setIdea(e.target.value)}
        placeholder="I have an idea for…"
        disabled={busy}
        rows={draft ? 4 : 3}
      />
      <div className="studio-composer-bottom">
        <button
          className={`studio-voice ${listening ? "is-listening" : ""}`}
          onClick={dictate}
          disabled={busy}
          aria-pressed={listening}
        >
          <StudioIcon name="mic" />
          {listening ? "Stop recording" : "Use voice"}
        </button>
        <span className="studio-count">{idea.length}/2,000</span>
        <button className={button} onClick={interpret} disabled={busy || idea.trim().length < 50}>
          {busy ? "Shaping…" : draft ? "Start new brief" : "Shape my idea"}
          <StudioIcon name="arrow" />
        </button>
      </div>
    </>
  );
  if (draft)
    return (
      <BuildWorkspace
        draft={draft}
        onChange={change}
        busy={busy}
        error={error}
        notice={notice}
        onSave={() => save()}
        onExport={download}
        demo={demo}
        editor={
          <section className="studio-panel studio-editor">
            <div className="studio-section-heading">
              <p className="studio-kicker">YOUR IDEA, TAKING SHAPE</p>
              <span className="studio-small-badge">
                <span className="studio-status-dot" />
                {confirmed ? "Reviewed" : "Draft"}
                {session ? ` · v${session.revision}` : ""}
              </span>
            </div>
            <h2>A shared starting point.</h2>
            <p className="studio-section-copy">
              Make it yours. Every detail is open for a second thought.
            </p>
            <div className="studio-tabs" role="tablist" aria-label="Brief views">
              {(["brief", "prompt", "schema"] as const).map((t) => (
                <button
                  key={t}
                  role="tab"
                  aria-selected={tab === t}
                  aria-controls={`studio-${t}`}
                  id={`tab-${t}`}
                  onClick={() => {
                    setTab(t);
                    if (t === "schema") setSpecText(JSON.stringify(draft.spec, null, 2));
                  }}
                >
                  {t === "brief"
                    ? "Product brief"
                    : t === "prompt"
                      ? "Model instructions"
                      : "Advanced spec"}
                </button>
              ))}
            </div>
            <div role="tabpanel" id={`studio-${tab}`} aria-labelledby={`tab-${tab}`}>
              {tab === "brief" && (
                <fieldset disabled={busy} className="space-y-5 pt-5">
                  <label className="block text-sm font-semibold">
                    Product name
                    <input
                      className={field}
                      maxLength={60}
                      value={draft.spec.name}
                      onChange={(e) =>
                        change({ ...draft, spec: { ...draft.spec, name: e.target.value } })
                      }
                    />
                  </label>
                  <label className="block text-sm font-semibold">
                    Product summary
                    <textarea
                      className={field}
                      rows={4}
                      maxLength={500}
                      value={draft.spec.summary}
                      onChange={(e) =>
                        change({ ...draft, spec: { ...draft.spec, summary: e.target.value } })
                      }
                    />
                  </label>
                  <div>
                    <h3 className="text-sm font-semibold">Pages & user journeys</h3>
                    {draft.spec.pages.map((p, i) => (
                      <div key={i} className="studio-page-card">
                        <label className="text-xs">
                          Page name
                          <input
                            className={field}
                            value={p.name}
                            onChange={(e) =>
                              change({
                                ...draft,
                                spec: {
                                  ...draft.spec,
                                  pages: draft.spec.pages.map((v, j) =>
                                    j === i ? { ...v, name: e.target.value } : v,
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                        <label className="text-xs">
                          What can users do here?
                          <textarea
                            className={field}
                            value={p.purpose}
                            onChange={(e) =>
                              change({
                                ...draft,
                                spec: {
                                  ...draft.spec,
                                  pages: draft.spec.pages.map((v, j) =>
                                    j === i ? { ...v, purpose: e.target.value } : v,
                                  ),
                                },
                              })
                            }
                          />
                        </label>
                        <button
                          className="mt-2 text-xs underline"
                          disabled={draft.spec.pages.length === 1}
                          onClick={() =>
                            change({
                              ...draft,
                              spec: {
                                ...draft.spec,
                                pages: draft.spec.pages.filter((_, j) => j !== i),
                              },
                            })
                          }
                        >
                          Remove page
                        </button>
                      </div>
                    ))}
                    <button
                      className="mt-3 text-sm font-semibold text-go"
                      onClick={() =>
                        change({
                          ...draft,
                          spec: {
                            ...draft.spec,
                            pages: [
                              ...draft.spec.pages,
                              {
                                name: "New page",
                                purpose: "Describe the user journey",
                                mustHave: true,
                              },
                            ],
                          },
                        })
                      }
                    >
                      + Add a page
                    </button>
                  </div>
                  <label className="block text-sm font-semibold">
                    Acceptance checks <span className="font-normal text-slate">(one per line)</span>
                    <textarea
                      className={field}
                      rows={4}
                      value={draft.acceptanceCriteria.join("\n")}
                      onChange={(e) =>
                        change({ ...draft, acceptanceCriteria: e.target.value.split("\n") })
                      }
                    />
                  </label>
                  <p className="text-xs text-slate">
                    Use Advanced spec to configure storage entities, authentication, and
                    integrations using the team’s shared schema.
                  </p>
                </fieldset>
              )}
              {tab === "prompt" && (
                <div className="pt-5">
                  <p className="mb-3 text-sm text-slate">
                    This is the instruction payload compiled from your brief. The build service may
                    add its own policies. No model is running.
                  </p>
                  <pre className="studio-code">{instructionPreview}</pre>
                </div>
              )}
              {tab === "schema" && (
                <div className="pt-5">
                  <p className="text-sm text-slate">
                    Edit the canonical Spec JSON, then apply it. Changes here are not saved until
                    applied.
                  </p>
                  <button
                    className="mt-3 text-sm underline"
                    onClick={() => setSpecText(JSON.stringify(draft.spec, null, 2))}
                  >
                    Load current spec
                  </button>
                  <textarea
                    aria-label="Spec JSON"
                    className={`${field} font-mono`}
                    rows={20}
                    value={specText}
                    onChange={(e) => setSpecText(e.target.value)}
                    disabled={busy}
                  />
                  <button
                    className={button}
                    disabled={busy}
                    onClick={() => {
                      try {
                        const next = PromptStudioDraftSchema.parse({
                          ...draft,
                          spec: JSON.parse(specText),
                        });
                        change(next);
                        setError("");
                        setNotice("Spec applied. Review the updated instructions.");
                      } catch {
                        setError(
                          "Invalid spec. Check field types, required values, and entity names.",
                        );
                      }
                    }}
                  >
                    Apply spec
                  </button>
                </div>
              )}
              <div className="mt-6 border-t border-rule pt-5">
                <label className="flex gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    disabled={!ready || busy}
                    onChange={(e) => setConfirmed(e.target.checked)}
                  />
                  <span>I reviewed the requirements, suggestions, and acceptance checks.</span>
                </label>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    className={button}
                    disabled={!confirmed || busy}
                    onClick={() => save(true)}
                  >
                    Mark reviewed
                  </button>
                  <button
                    className="studio-button studio-button-secondary"
                    disabled={busy || !parsed?.success}
                    onClick={() => save()}
                  >
                    Save draft
                  </button>
                  <button
                    className="studio-button studio-button-secondary"
                    disabled={busy || !parsed?.success}
                    onClick={download}
                  >
                    Export JSON
                  </button>
                </div>
                <p className="mt-3 text-xs text-slate">
                  Answer all questions to mark reviewed. Estimation, operator approval, and builds
                  are separate steps and are not connected yet.
                </p>
              </div>
            </div>
          </section>
        }
      />
    );
  return (
    <div className={`conduit-studio ${draft ? "has-draft" : "is-welcome"}`}>
      <div className="studio-landscape" aria-hidden="true" />
      <nav className="studio-nav" aria-label="Prompt Studio navigation">
        <a href="/prompt-studio-demo" className="studio-brand" aria-label="Conduit home">
          <svg width="26" height="27" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <path
              d="M20 6C17 2 10 3 7 8L3 15c-3 6 5 10 8 5l4-7"
              stroke="currentColor"
              strokeWidth="5.5"
              strokeLinecap="round"
            />
            <path d="m17 11 5 9" stroke="currentColor" strokeWidth="6" strokeLinecap="round" />
          </svg>
          conduit
        </a>
        <span className="studio-nav-divider" />
        <span className="studio-nav-label">Prompt Studio</span>
        <a href={demo ? "/apps/new" : "/apps"} className="studio-nav-cta">
          {demo ? "Your workspace" : "My apps"}
          <span aria-hidden="true">↗</span>
        </a>
      </nav>
      <header className="studio-hero">
        <p className="studio-eyebrow">
          <span /> A LITTLE IDEA. A WORLD OF POSSIBILITY.
        </p>
        <h1>
          {draft ? (
            <>
              Good ideas grow
              <br />
              with <em>a little clarity.</em>
            </>
          ) : (
            <>
              Every great product
              <br />
              begins with <em>an idea.</em>
            </>
          )}
        </h1>
        <p className="studio-subtitle">
          {draft
            ? "A few thoughtful details. A brief that feels like you."
            : "Tell us what’s on your mind. Let’s give it a shape."}
        </p>
      </header>
      <div className="studio-content">
        <ol className="studio-steps" aria-label="Your progress">
          <li
            className={!draft ? "is-current" : "is-complete"}
            aria-current={!draft ? "step" : undefined}
          >
            <span>{draft ? <StudioIcon name="check" /> : "01"}</span>Your idea
          </li>
          <li
            className={draft && !confirmed ? "is-current" : ""}
            aria-current={draft && !confirmed ? "step" : undefined}
          >
            <span>02</span>A little clarity
          </li>
          <li
            className={confirmed ? "is-current" : ""}
            aria-current={confirmed ? "step" : undefined}
          >
            <span>03</span>Ready to build
          </li>
        </ol>
        {error && (
          <p role="alert" className="studio-alert">
            {error}
          </p>
        )}
        {notice && (
          <p role="status" className="studio-notice">
            <StudioIcon name="check" />
            {notice}
          </p>
        )}
        {
          <div className="studio-welcome">
            <div className="studio-input-panel">
              <div className="studio-composer">{composer}</div>
              <div className="studio-examples">
                <span>Try an example prompt</span>
                <button onClick={() => setIdea(sample)} disabled={busy}>
                  <StudioIcon name="spark" />A booking platform<span aria-hidden="true">↗</span>
                </button>
                <button
                  onClick={() =>
                    setIdea(
                      "Build a private client portal for a small design agency. Clients should see project progress, approve designs, and share feedback. Team members should manage their own projects.",
                    )
                  }
                  disabled={busy}
                >
                  <StudioIcon name="code" />A client portal<span aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
            <p className="studio-helper">
              Start with at least 50 characters. No technical vocabulary needed.
            </p>
            <details className="studio-privacy">
              <summary>Voice & privacy</summary>
              <p>
                Voice uses your browser’s transcription service and may send audio to its provider.
                Avoid passwords, personal data, and API keys.
              </p>
            </details>
            <div className="studio-assurances">
              <span>
                <StudioIcon name="leaf" />
                Space to think
              </span>
              <span>
                <StudioIcon name="code" />
                Every instruction, visible
              </span>
              <span>
                <StudioIcon name="check" />
                You’re in control
              </span>
            </div>
          </div>
        }

        <footer className="studio-footer">
          <span>
            <span className="studio-status-dot" />
            Mock adapter · No model charges
          </span>
          <span>
            {demo ? (
              <>
                Demo mode · <a href="/apps/new">Sign in to save your work ↗</a>
              </>
            ) : (
              "Your idea stays yours."
            )}
          </span>
        </footer>
      </div>
    </div>
  );
}
