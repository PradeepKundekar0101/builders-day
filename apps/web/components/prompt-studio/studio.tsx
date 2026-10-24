"use client";

import { useEffect, useRef, useState } from "react";
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
const field =
  "mt-2 w-full rounded-xl border border-rule bg-white p-3 text-sm outline-none focus:border-go focus:ring-2 focus:ring-go/15";
const button =
  "rounded-xl bg-go px-5 py-3 text-sm font-semibold text-white hover:bg-go-hover disabled:opacity-40";

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
  return (
    <div className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[.2em] text-go">
            Conduit / Prompt Studio
          </p>
          <h1 className="mt-3 text-4xl font-bold tracking-tight">A clear brief. A better build.</h1>
          <p className="mt-3 max-w-2xl text-slate">
            Bring your idea. Shape the details. See exactly what your builder will receive.
          </p>
        </div>
        <span className="rounded-full border border-rule bg-white px-4 py-2 text-xs font-semibold">
          Mock adapter · No model charges
        </span>
      </div>
      {demo && (
        <p className="mb-5 rounded-xl bg-marker/30 p-4 text-sm">
          Interactive demo. Drafts are not stored here.{" "}
          <a className="underline" href="/apps/new">
            Sign in to save your work
          </a>
          .
        </p>
      )}
      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-danger p-4 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 text-sm text-go">
          {notice}
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-[.9fr_1.1fr]">
        <section className="rounded-2xl border border-rule bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate">01 / Your idea</p>
          <h2 className="mt-2 text-xl font-bold">What do you want to build?</h2>
          <p className="mt-2 text-sm text-slate">
            Tell us who it helps, what they should do, and what success looks like.
          </p>
          <label className="mt-5 block text-sm font-semibold" htmlFor="idea">
            Describe your product
          </label>
          <textarea
            id="idea"
            className={field}
            rows={7}
            value={idea}
            maxLength={2000}
            onChange={(e) => setIdea(e.target.value)}
            placeholder="I want to build a platform that…"
            disabled={busy}
          />
          <div className="mt-2 flex justify-between text-xs text-slate">
            <button onClick={() => setIdea(sample)} disabled={busy} className="underline">
              Try a booking example
            </button>
            <span>{idea.length}/2,000 · minimum 50</span>
          </div>
          <div className="mt-5 flex gap-3">
            <button
              className={button}
              onClick={interpret}
              disabled={busy || idea.trim().length < 50}
            >
              {draft ? "Start new brief" : "Shape my idea"}
            </button>
            <button
              className="rounded-xl border border-rule px-4 text-sm"
              onClick={dictate}
              disabled={busy}
            >
              {listening ? "Stop recording" : "Use voice"}
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-slate">
            Voice uses your browser’s transcription service and may send audio to its provider.
            Avoid passwords, personal data, and API keys. Starting a new brief replaces the current
            unsaved draft.
          </p>
          {draft && (
            <fieldset disabled={busy} className="mt-8 border-t border-rule pt-6">
              <legend className="pt-5 text-lg font-bold">Let’s fill in the gaps</legend>
              <p className="mb-4 text-sm text-slate">
                Your answers appear in the instructions. This mock does not infer features from
                them.
              </p>
              {draft.questions.map((q, i) => (
                <label key={q.id} className="mb-5 block text-sm font-medium">
                  {i + 1}. {q.question}
                  <textarea
                    className={field}
                    rows={3}
                    maxLength={2000}
                    value={q.answer ?? ""}
                    onChange={(e) =>
                      change({
                        ...draft,
                        questions: draft.questions.map((item) =>
                          item.id === q.id
                            ? { ...item, answer: e.target.value || undefined }
                            : item,
                        ),
                      })
                    }
                  />
                </label>
              ))}
            </fieldset>
          )}
        </section>
        <section className="rounded-2xl border border-rule bg-white p-6">
          <p className="text-xs font-bold uppercase tracking-widest text-slate">
            02 / Your build brief
          </p>
          <div className="mt-4 flex gap-2 border-b border-rule pb-4">
            {(["brief", "prompt", "schema"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === t ? "bg-go text-white" : "bg-paper"}`}
              >
                {t === "brief"
                  ? "Product brief"
                  : t === "prompt"
                    ? "Model instructions"
                    : "Advanced spec"}
              </button>
            ))}
          </div>
          {!draft ? (
            <div className="py-24 text-center">
              <div className="text-4xl text-go">✧</div>
              <h3 className="mt-4 text-xl font-semibold">Your idea, made actionable</h3>
              <p className="mx-auto mt-3 max-w-xs text-sm text-slate">
                Start with a description. Your editable brief and transparent model instructions
                will appear here.
              </p>
            </div>
          ) : (
            <>
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
                      <div key={i} className="mt-3 rounded-xl bg-paper p-3">
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
                  <pre className="max-h-[650px] overflow-auto whitespace-pre-wrap rounded-xl bg-paper p-4 text-xs leading-relaxed">
                    {instructionPreview}
                  </pre>
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
                    className="rounded-xl border border-rule px-4 py-3 text-sm"
                    disabled={busy || !parsed?.success}
                    onClick={() => save()}
                  >
                    Save draft
                  </button>
                  <button
                    className="rounded-xl border border-rule px-4 py-3 text-sm"
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
            </>
          )}
        </section>
      </div>
    </div>
  );
}
