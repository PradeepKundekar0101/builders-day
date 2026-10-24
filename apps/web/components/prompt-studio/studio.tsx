"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ProvnLogo } from "@/components/provn-logo";
import { WorkspaceNav } from "./workspace-nav";
import { BuilderOnboarding } from "./onboarding";
import { DEFAULT_PROFILE, type BuilderProfile } from "@/lib/provn-demo";
import "./p0-panels.css";
import "./design-system.css";
import type { StudioBuildConnection } from "@/lib/prompt-studio/build-events";
import {
  StudioVersionSchema,
  prepareSaveAttempt,
  type StudioVersion,
  type SaveAttempt,
} from "@/lib/prompt-studio/history";
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

const subscribeOnboarding = () => () => {};
function onboardingWasDismissed() {
  try {
    return localStorage.getItem("provn-onboarding-dismissed") === "1";
  } catch {
    return false;
  }
}
export function PromptStudio({
  demo = false,
  buildConnection,
}: {
  demo?: boolean;
  buildConnection?: StudioBuildConnection;
}) {
  const params = useSearchParams();
  const onboardingDismissed = useSyncExternalStore(
    subscribeOnboarding,
    onboardingWasDismissed,
    () => true,
  );
  const [live, setLive] = useState(false);
  const [history, setHistory] = useState<StudioVersion[]>([]);
  const pendingSave = useRef<SaveAttempt | null>(null);
  const [pauseRevision, setPauseRevision] = useState(0);
  const [modelTrace, setModelTrace] = useState("");
  const modelRequest = useRef<AbortController | null>(null);
  const [profile, setProfile] = useState<BuilderProfile>(DEFAULT_PROFILE);
  const [showOnboarding, setShowOnboarding] = useState(() => demo || !params.get("session"));
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
    if (!loadId || demo || session?.id === loadId) return;
    const controller = new AbortController();
    fetch(`/api/prompt-studio/sessions/${encodeURIComponent(loadId)}`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        const loaded = PromptStudioDraftSchema.parse(data.draft);
        setDraft(loaded);
        setHistory(StudioVersionSchema.array().parse(data.history));
        setProfile(loaded.onboarding ?? DEFAULT_PROFILE);
        setLive(loaded.adapterMode === "openai");
        setPauseRevision((value) => value + 1);
        setConfirmed(false);
        setModelTrace("");
        setIdea(loaded.input.idea);
        setSpecText(JSON.stringify(loaded.spec, null, 2));
        setSession({ id: data.id, revision: data.revision });
        setNotice(`Loaded saved version ${data.revision}.`);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [loadId, demo, session?.id]);
  useEffect(
    () => () => {
      speech.current?.stop();
      modelRequest.current?.abort();
    },
    [],
  );
  function dismissOnboarding() {
    setShowOnboarding(false);
    try {
      localStorage.setItem("provn-onboarding-dismissed", "1");
    } catch {
      /* Keep this session usable. */
    }
  }
  function change(next: PromptStudioDraft) {
    setDraft(next);
    setConfirmed(false);
    setNotice("Unsaved changes");
  }
  async function interpret(chosenProfile?: BuilderProfile) {
    if (busy || !idea.trim()) return;
    setError("");
    setBusy(true);
    try {
      const settings = chosenProfile ?? profile;
      const next = live
        ? await requestModel({ input: { idea, links: [] }, profile: settings })
        : sanitizeStudioDraft(await new MockPromptStudioAdapter().interpret({ idea, links: [] }));
      setDraft({ ...next, onboarding: settings });
      setSpecText(JSON.stringify(next.spec, null, 2));
      setSession(null);
      setHistory([]);
      pendingSave.current = null;
      setPauseRevision(0);
      setConfirmed(false);
      if (!live) setNotice("Mock scaffold created. Review all suggestions; no model was called.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to interpret your idea. Your input is preserved.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function requestModel(payload: unknown): Promise<PromptStudioDraft> {
    const controller = new AbortController();
    modelRequest.current = controller;
    try {
      const response = await fetch("/api/prompt-studio/interpret", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Model request failed. Your input is preserved.");
      const next = PromptStudioDraftSchema.parse(result.draft);
      setModelTrace(JSON.stringify(result.trace, null, 2));
      setNotice(result.changeSummary);
      return next;
    } catch (e) {
      if (controller.signal.aborted)
        throw new Error(
          "Request cancelled. Your input is preserved. Provider usage may still apply.",
        );
      throw e;
    } finally {
      modelRequest.current = null;
    }
  }
  async function refine(next: PromptStudioDraft, message: string): Promise<boolean> {
    setBusy(true);
    setError("");
    setConfirmed(false);
    try {
      const updated = await requestModel({ input: next.input, draft: next, message });
      setDraft(updated);
      setSpecText(JSON.stringify(updated.spec, null, 2));
      return true;
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Refinement failed. Your previous brief is preserved.",
      );
      return false;
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
      const attempt = prepareSaveAttempt(
        pendingSave.current,
        session,
        clean,
        review ? "user_reviewed" : "draft",
      );
      pendingSave.current = attempt;
      const id = attempt.body.id;
      const response = await fetch(`/api/prompt-studio/sessions${session ? `/${id}` : ""}`, {
        method: session ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(attempt.body),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      const saved = PromptStudioDraftSchema.parse(data.draft);
      setDraft(saved);
      pendingSave.current = null;
      setHistory((old) =>
        [
          {
            revision: data.revision,
            payload: saved,
            status: data.status,
            created_at: new Date().toISOString(),
          },
          ...old.filter((v) => v.revision !== data.revision),
        ].slice(0, 20),
      );
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
      a.download = "provn-prompt-brief.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Check the brief before exporting.");
    }
  }
  function restoreVersion(version: StudioVersion) {
    const restored = PromptStudioDraftSchema.parse(version.payload);
    setDraft(restored);
    setSpecText(JSON.stringify(restored.spec, null, 2));
    setIdea(restored.input.idea);
    setConfirmed(false);
    setPauseRevision((value) => value + 1);
    setModelTrace("");
    setError("");
    setNotice(
      `Version ${version.revision} restored as an unsaved draft. Save to create a new version; progression is paused.`,
    );
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
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && idea.trim().length > 0 && !busy) {
            e.preventDefault();
            void interpret();
          }
        }}
        placeholder="Describe your app, who it is for, and what it should do."
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
        <button
          className={button}
          onClick={() => interpret()}
          disabled={busy || idea.trim().length === 0}
        >
          {busy ? "Shaping…" : draft ? "Start new brief" : "Shape my idea"}
          <StudioIcon name="arrow" />
        </button>
      </div>
    </>
  );
  if (loadId && !demo && session?.id !== loadId && !error)
    return (
      <p className="p-8" role="status">
        Loading your saved workspace…
      </p>
    );
  if (draft)
    return (
      <BuildWorkspace
        key={`${session?.id ?? "new"}:${pauseRevision}:${buildConnection?.runId ?? "demo"}`}
        pauseRevision={pauseRevision}
        buildConnection={buildConnection}
        onRefine={refine}
        onCancel={() => modelRequest.current?.abort()}
        reviewed={confirmed}
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
            {draft.assumptions?.length ? (
              <div className="p0-warning">
                <strong>Assumptions to review</strong>
                <ul>
                  {draft.assumptions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>
            ) : null}
            <details>
              <summary>Saved versions & prompt history ({history.length})</summary>
              <p>
                Saving preserves a brief and its compiled instructions. Restoring creates an unsaved
                copy; existing versions stay intact. Export current edits before restoring if you
                want to keep them. This is not a log of actual provider requests.
              </p>
              {!history.length && (
                <p>
                  {demo
                    ? "Sign in to save and resume versions. You can export this demo brief."
                    : "Save your first version to start the history."}
                </p>
              )}
              {history.map((version) => (
                <details key={version.revision}>
                  <summary>
                    Version {version.revision} · {version.status} ·{" "}
                    {new Date(version.created_at).toLocaleString()}
                  </summary>
                  <pre className="studio-code">
                    {compileStudioInstructions(sanitizeStudioDraft(version.payload))}
                  </pre>
                  <button
                    className="studio-button studio-button-secondary"
                    disabled={busy}
                    onClick={() => restoreVersion(version)}
                  >
                    Restore version {version.revision} as draft
                  </button>
                </details>
              ))}
            </details>
            {modelTrace && (
              <details>
                <summary>Last model request · exact instructions and usage</summary>
                <pre className="studio-code">{modelTrace}</pre>
                <p>
                  Application-controlled payload; excludes provider-internal instructions. Not
                  release evidence.
                </p>
              </details>
            )}
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
                  Answer all questions and review the brief, then open Cost Guard to approve a
                  simulated run. Real billing and build services are not connected.
                </p>
              </div>
            </div>
          </section>
        }
      />
    );
  return (
    <div className="provn-home-shell">
      <WorkspaceNav
        project="Your next build"
        onSelect={() => {
          setNotice(
            "Describe your idea to begin. Your prompts, preview and build tools will open in the workspace.",
          );
          document.getElementById("idea")?.focus();
        }}
      />
      <div className={`conduit-studio ${draft ? "has-draft" : "is-welcome"}`}>
        {showOnboarding && !onboardingDismissed && (
          <BuilderOnboarding
            onClose={dismissOnboarding}
            onComplete={(settings) => {
              setProfile(settings);
              dismissOnboarding();
              if (idea.trim().length > 0) void interpret(settings);
            }}
          />
        )}
        <div className="studio-landscape" aria-hidden="true"></div>
        <nav className="studio-nav" aria-label="Prompt Studio navigation">
          <a href="/prompt-studio-demo" className="studio-brand" aria-label="PROVN home">
            <ProvnLogo />
          </a>
          <span className="studio-nav-divider" />
          <a className="studio-nav-label" href="/signin">
            Sign in
          </a>
          <a href="#idea" className="studio-nav-cta">
            Start a build
            <span aria-hidden="true">↗</span>
          </a>
        </nav>
        <header className="studio-hero">
          <p className="studio-eyebrow">
            <span /> YOUR IDEAS. BEYOND POSSIBILITY.
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
                Every build,
                <br />
                <em>proven.</em>
              </>
            )}
          </h1>
          <p className="studio-subtitle">
            {draft
              ? "A few thoughtful details. A brief that feels like you."
              : "Explore a guided path from idea to app—with a clear budget and security checks you can inspect."}
          </p>
        </header>
        <div className="studio-content">
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
                <p className="portal-input-label">What do you want to build?</p>
                <label className="studio-live-toggle">
                  <input
                    type="checkbox"
                    checked={live}
                    disabled={busy}
                    onChange={(e) => setLive(e.target.checked)}
                  />{" "}
                  Use live AI · requires sign-in; provider charges apply to replies and automatic
                  stage progression.
                </label>
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
              {busy && (
                <button className="studio-button" onClick={() => modelRequest.current?.abort()}>
                  Cancel model request
                </button>
              )}
              <p className="studio-helper">
                {live
                  ? "Live intake · each submission calls the configured cloud model"
                  : "Describe your idea · ⌘ / Ctrl + Enter to begin · No credits used"}
              </p>
            </div>
          }

          <footer className="studio-footer">
            <span>
              <span className="studio-status-dot" />
              {live
                ? "Live AI selected · build services still simulated"
                : "Mock adapter · No model charges"}
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
    </div>
  );
}
