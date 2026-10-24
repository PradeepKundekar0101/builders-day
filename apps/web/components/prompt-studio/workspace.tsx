"use client";
import {
  acceptBuildEvent,
  type StudioBuildConnection,
  type StudioBuildState,
} from "@/lib/prompt-studio/build-events";
import { JourneyGuide } from "./journey-guide";
import { ProvnLogo } from "@/components/provn-logo";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PromptStudioDraft } from "@buildwise/shared";
import "./workspace.css";
import { P0Panels, useProvnDemo, type P0Module } from "./p0-panels";

type Props = {
  buildHref?: string;
  pauseOnOpen?: boolean;
  message: string;
  onMessageChange: (value: string) => void;
  pauseRevision?: number;
  buildConnection?: StudioBuildConnection;
  onRefine: (draft: PromptStudioDraft, message: string) => Promise<boolean>;
  onCancel: () => void;
  reviewed: boolean;
  draft: PromptStudioDraft;
  onChange: (draft: PromptStudioDraft) => void;
  busy: boolean;
  error: string;
  notice: string;
  onSave: () => void;
  onExport: () => void;
  demo: boolean;
  editor: ReactNode;
};
const stages = [
  "Reading the current product brief",
  "Mapping pages and navigation",
  "Preparing a local visual scaffold",
  "Checking preview layout",
  "Simulation complete. No application deployed.",
];
export function BuildWorkspace({
  buildHref,
  pauseOnOpen = false,
  message,
  onMessageChange: setMessage,
  pauseRevision = 0,
  buildConnection,
  onRefine,
  onCancel,
  draft,
  reviewed,
  onChange,
  busy,
  error,
  notice,
  onSave,
  onExport,
  demo,
  editor,
}: Props) {
  const [leftTab, setLeftTab] = useState<"chat" | "brief">(
    draft.onboarding?.mode === "dev" ? "brief" : "chat",
  );
  const [rightTab, setRightTab] = useState<"preview" | "live" | "modules">("preview");
  const journey = useProvnDemo(draft, reviewed);
  const [module, setModule] = useState<P0Module>("cost");
  const [paused, setPaused] = useState(pauseOnOpen || pauseRevision > 0);
  const [localError, setLocalError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [page, setPage] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const buildStage = draft.buildStage ?? 0;
  const [buildState, setBuildState] = useState<StudioBuildState>({
    sequence: 0,
    completedStage: null,
    error: "",
  });
  const currentStage = useRef(buildStage);
  useEffect(() => {
    currentStage.current = buildStage;
  }, [buildStage]);
  useEffect(() => {
    if (!buildConnection) return;
    return buildConnection.subscribe(
      (raw) =>
        setBuildState((previous) =>
          acceptBuildEvent(
            previous,
            raw,
            buildConnection.runId,
            currentStage.current,
            buildConnection.allowedPreviewOrigins,
            window.location.origin,
          ),
        ),
      () =>
        setBuildState((previous) => ({
          ...previous,
          completedStage: null,
          error:
            "Build connection lost. Progression is paused; reconnect through your build service.",
        })),
    );
  }, [buildConnection]);
  const phaseNames = [
    "Initial layout",
    "Primary user journey",
    "Data and connections",
    "Review and handoff",
  ];
  useEffect(() => {
    buildConnection?.onDraftChange?.(draft);
  }, [buildConnection, draft]);
  const questionStage = (q: PromptStudioDraft["questions"][number]) =>
    q.stage ?? (q.id === "data" ? 2 : 1);
  const next = draft.questions.find((q) => !q.answer?.trim() && questionStage(q) <= buildStage);
  useEffect(() => {
    if (paused || message.trim() || busy || next || buildStage >= 3 || error || buildState.error)
      return;
    if (buildConnection && buildState.completedStage !== buildStage) return;
    const timer = setTimeout(
      () => {
        const updated = { ...draft, buildStage: buildStage + 1 };
        if (!buildConnection && draft.adapterMode === "openai")
          void onRefine(
            updated,
            `Continue to build stage ${buildStage + 1}. Ask only a blocking question for this stage; otherwise proceed with explicit assumptions.`,
          );
        else onChange(updated);
      },
      buildConnection ? 0 : 2200,
    );
    return () => clearTimeout(timer);
  }, [
    buildStage,
    paused,
    message,
    busy,
    next,
    error,
    draft,
    onRefine,
    onChange,
    buildConnection,
    buildState.completedStage,
    buildState.error,
  ]);
  const answered = draft.questions.filter((q) => q.answer?.trim()).length;
  const activePage = draft.spec.pages[Math.min(page, draft.spec.pages.length - 1)];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [answered, notes.length]);
  useEffect(() => {
    if (!running) return;
    let current = 0;
    const timer = setInterval(() => {
      current += 1;
      setStep(current);
      if (current >= stages.length - 1) {
        setRunning(false);
        clearInterval(timer);
      }
    }, 750);
    return () => clearInterval(timer);
  }, [running]);
  async function send() {
    const text = message.trim();
    if (!text || busy) return;
    setLocalError("");
    if (draft.adapterMode === "openai") {
      const proposed = next
        ? {
            ...draft,
            questions: draft.questions.map((q) => (q.id === next.id ? { ...q, answer: text } : q)),
          }
        : draft;
      if (await onRefine(proposed, text)) {
        setMessage("");
        if (!next) setNotes((old) => [...old, text]);
      }
      return;
    }
    if (next)
      onChange({
        ...draft,
        questions: draft.questions.map((q) => (q.id === next.id ? { ...q, answer: text } : q)),
      });
    else {
      const idea = `${draft.input.idea}\n\nAdditional requirement: ${text}`;
      if (idea.length > 2000) {
        setLocalError(
          "This note exceeds the brief’s 2,000-character limit. Refine the existing brief instead.",
        );
        return;
      }
      onChange({ ...draft, input: { ...draft.input, idea } });
      setNotes((old) => [...old, text]);
    }
    setMessage("");
  }
  return (
    <div className="conduit-build-workspace">
      <header className="build-topbar">
        <a href="/prompt-studio-demo" className="build-wordmark" aria-label="PROVN home">
          <ProvnLogo />
        </a>
        <span className="build-top-divider" />
        <div className="build-project">
          <span className="build-project-icon">⌘</span>
          <span>
            {draft.spec.name}
            <small>Prompt Studio / workspace</small>
          </span>
        </div>
        <span className="build-mode">
          <i />
          {draft.adapterMode === "openai" ? "Live intake · draft preview" : "Mock environment"}
        </span>
        {buildHref && (
          <a className="build-export" href={buildHref}>
            Build product ↗
          </a>
        )}
        <button onClick={onSave} disabled={busy} className="build-quiet-button">
          Save draft
        </button>
        <button onClick={onExport} disabled={busy} className="build-export">
          Export brief ↗
        </button>
      </header>
      <nav className="provn-stage-path" aria-label="Build stages">
        {["Brief", "Estimate", "Build", "Deploy", "Security review", "Proof"].map((label, i) => (
          <span key={label}>
            {String(i + 1).padStart(2, "0")} <b>{label}</b>
            {i < 5 && <i aria-hidden="true">→</i>}
          </span>
        ))}
      </nav>
      <div className="build-split">
        <section className="build-conversation" aria-label="Agent conversation">
          <div className="build-panel-toolbar">
            <div className="build-view-tabs">
              <button aria-pressed={leftTab === "chat"} onClick={() => setLeftTab("chat")}>
                ✦ Agent chat
              </button>
              <button aria-pressed={leftTab === "brief"} onClick={() => setLeftTab("brief")}>
                ≡ Brief & prompts
              </button>
            </div>
            <span className="build-small-label">{phaseNames[buildStage]}</span>
          </div>
          {(error || localError || buildState.error) && (
            <p role="alert" className="build-error">
              {error || localError || buildState.error}
            </p>
          )}
          {notice && notice !== "Unsaved changes" && (
            <p role="status" className="build-notice">
              {notice}
            </p>
          )}
          {leftTab === "brief" ? (
            <div className="build-brief-scroll" inert={busy}>
              {editor}
            </div>
          ) : (
            <>
              <div
                className="build-chat-scroll"
                role="log"
                aria-label="Conversation history"
                aria-live="polite"
              >
                <div className="build-chat-date">
                  YOUR NEW BUILD <span>·</span> TODAY
                </div>
                <article className="build-message build-message-user">
                  <div className="build-message-label">
                    <span className="build-avatar user">Y</span>You<span>Initial idea</span>
                  </div>
                  <p>{draft.input.idea.split("\n\nAdditional requirement:")[0]}</p>
                </article>
                <article className="build-message">
                  <div className="build-message-label">
                    <span className="build-avatar">✦</span>PROVN
                    <span className="build-agent-tag">
                      {draft.adapterMode === "openai" ? "GUIDE · LIVE AI" : "GUIDE · MOCK"}
                    </span>
                  </div>
                  <p>
                    I’m preparing your first layout from the idea you shared. I’ll ask for a
                    decision only when the current stage needs it. You can change direction at any
                    time.
                  </p>
                  <div className="build-plan" role="status">
                    <span>CURRENT STAGE · {buildStage + 1}/4</span>
                    <div>{phaseNames[buildStage]}</div>
                    <p>
                      {next
                        ? "This decision is needed for the current stage."
                        : buildStage < 3
                          ? buildConnection
                            ? "Waiting for the current build stage to complete…"
                            : "Preparing the next part of your simulated preview…"
                          : "Your staged brief is ready for review."}
                    </p>
                    <small>
                      {buildConnection
                        ? "Progression follows build-engine completion events."
                        : "Draft preview · use Build product for a real run"}
                    </small>
                    {buildStage < 3 && (
                      <button className="build-inline-button" onClick={() => setPaused(!paused)}>
                        {paused ? "Resume progression" : "Pause progression"}
                      </button>
                    )}
                  </div>
                </article>
                {draft.questions.map((q, i) => {
                  if (!q.answer && q.id !== next?.id) return null;
                  return (
                    <div key={q.id}>
                      <article className="build-message">
                        <div className="build-message-label">
                          <span className="build-avatar">✦</span>PROVN
                          <span>Decision {i + 1}</span>
                        </div>
                        <div className="build-question-bubble">
                          <span>LET’S SHAPE YOUR IDEA</span>
                          <p>{q.question}</p>
                        </div>
                      </article>
                      {q.answer && (
                        <article className="build-message build-message-user">
                          <div className="build-message-label">
                            <span className="build-avatar user">Y</span>You
                            <button
                              disabled={busy}
                              onClick={() => {
                                setMessage(q.answer ?? "");
                                onChange({
                                  ...draft,
                                  questions: draft.questions.map((item) =>
                                    item.id === q.id ? { ...item, answer: undefined } : item,
                                  ),
                                });
                              }}
                            >
                              Edit answer
                            </button>
                          </div>
                          <p>{q.answer}</p>
                        </article>
                      )}
                    </div>
                  );
                })}
                <JourneyGuide
                  stage={buildStage}
                  reviewed={reviewed}
                  current={journey.current}
                  state={journey.state}
                  profile={journey.profile}
                  quote={journey.quote.total}
                  busy={busy}
                  onOpen={(destination) => {
                    if (destination === "brief") setLeftTab("brief");
                    else {
                      setModule(destination);
                      setRightTab("modules");
                    }
                  }}
                />
                {notes.map((note, i) => (
                  <article className="build-message build-message-user" key={i}>
                    <div className="build-message-label">
                      <span className="build-avatar user">Y</span>You
                      <span>Additional requirement</span>
                    </div>
                    <p>{note}</p>
                    <small>
                      Added to your original product intent. Update the brief to reflect any feature
                      changes.
                    </small>
                  </article>
                ))}
                <div ref={bottom} />
              </div>
              <form
                className="build-chat-composer"
                onSubmit={(e) => {
                  e.preventDefault();
                  send();
                }}
              >
                <div className="build-composer-state">
                  <i />
                  {next
                    ? "Agent is waiting for your answer"
                    : buildStage < 3
                      ? "Preview progressing · you can add direction"
                      : "Your brief is ready to refine"}
                </div>
                <label htmlFor="agent-message" className="sr-only">
                  Message PROVN
                </label>
                <textarea
                  id="agent-message"
                  value={message}
                  maxLength={2000}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                      e.preventDefault();
                      send();
                    }
                  }}
                  placeholder={
                    next ? "Tell PROVN what you have in mind…" : "Add another requirement…"
                  }
                  rows={3}
                  disabled={busy}
                />
                <div className="build-composer-actions">
                  {busy && (
                    <button type="button" onClick={onCancel}>
                      Cancel request
                    </button>
                  )}
                  <span>
                    ↵ Send <span>·</span> Shift + Enter for a new line
                  </span>
                  <button
                    type="submit"
                    disabled={!message.trim() || busy}
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
              </form>
              <div className="build-chat-footer">
                <span>✦ Guided intake</span>
                <span>
                  {draft.adapterMode === "openai"
                    ? "Live AI · provider usage applies"
                    : "No model calls · No credits used"}
                </span>
              </div>
            </>
          )}
        </section>
        <section className="build-preview" aria-label="Application preview and deployment">
          <div className="build-panel-toolbar">
            <div className="build-view-tabs">
              <button aria-pressed={rightTab === "preview"} onClick={() => setRightTab("preview")}>
                ◉ Preview
              </button>
              <button aria-pressed={rightTab === "live"} onClick={() => setRightTab("live")}>
                ↗ Live
              </button>
            </div>
            <div className="build-preview-actions">
              <button
                aria-label={mobile ? "Use desktop preview" : "Use mobile preview"}
                onClick={() => setMobile(!mobile)}
                title="Toggle preview width"
              >
                {mobile ? "▣" : "▯"}
              </button>
              <button aria-label="Refresh preview" onClick={() => setRefreshKey((v) => v + 1)}>
                ↻
              </button>
              <button
                className="build-deploy"
                disabled
                title="Connect the deployment service to publish"
              >
                ↑ Publish
              </button>
            </div>
          </div>
          <nav className="p0-module-nav" aria-label="P0 product modules">
            {(
              [
                ["cost", "Cost Guard"],
                ["route", "Route"],
                ["launch", "Launch"],
                ["shield", "Shield / Siege"],
                ["proof", "Proof"],
                ["wallet", "Wallet"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={rightTab === "modules" && module === id}
                onClick={() => {
                  setModule(id);
                  setRightTab("modules");
                }}
              >
                {label}
                {id === "shield" && journey.state.criticalOpen > 0 ? (
                  <span className="p0-alert-dot" />
                ) : null}
              </button>
            ))}
          </nav>
          {rightTab === "modules" ? (
            <P0Panels
              module={module}
              setModule={setModule}
              controller={journey}
              draft={draft}
              onChange={onChange}
              onReview={() => setLeftTab("brief")}
              onBuild={() => {
                setStep(0);
                setRunning(true);
                setConsoleOpen(true);
              }}
              running={running}
            />
          ) : rightTab === "preview" && buildConnection && buildState.previewUrl ? (
            <iframe
              title="Running application preview"
              src={buildState.previewUrl}
              sandbox="allow-scripts allow-forms"
              referrerPolicy="no-referrer"
              style={{ width: "100%", flex: 1, border: 0, background: "white" }}
            />
          ) : rightTab === "preview" ? (
            <>
              <div className="build-address">
                <span className="build-window-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>
                  ⌑ &nbsp; local scaffold / {activePage?.name.toLowerCase().replaceAll(" ", "-")}
                </span>
                <span className="build-wireframe-tag">WIREFRAME</span>
              </div>
              <div className="build-preview-stage">
                <div className={`build-app-surface ${mobile ? "is-mobile" : ""}`} key={refreshKey}>
                  <div className="scaffold-nav">
                    <strong>
                      <span>◈</span>
                      {draft.spec.name}
                    </strong>
                    <span>Preview only</span>
                  </div>
                  <nav className="scaffold-pages" aria-label="Preview pages">
                    {draft.spec.pages.slice(0, buildStage === 0 ? 1 : undefined).map((p, i) => (
                      <button
                        key={i}
                        onClick={() => setPage(i)}
                        aria-current={page === i ? "page" : undefined}
                      >
                        {p.name}
                      </button>
                    ))}
                  </nav>
                  <div className="scaffold-content">
                    <span className="scaffold-eyebrow">YOUR PRODUCT, TAKING SHAPE</span>
                    <h1>{activePage?.name}</h1>
                    <p>{activePage?.purpose}</p>
                    <div className="scaffold-summary">
                      <span>PRODUCT BRIEF</span>
                      <h2>{draft.spec.summary}</h2>
                    </div>
                    <div className="scaffold-grid">
                      {["Primary journey", "Your data", "Connections"]
                        .slice(0, buildStage === 0 ? 0 : buildStage === 1 ? 1 : 3)
                        .map((title, i) => (
                          <div key={title}>
                            <span>0{i + 1}</span>
                            <h3>{title}</h3>
                            <p>
                              {i === 0
                                ? draft.questions.find((q) => q.id === "journey")?.answer ||
                                  "Define this in the conversation."
                                : i === 1
                                  ? `${draft.spec.entities.length} data entities defined in your brief.`
                                  : `${draft.spec.integrations.length} integrations defined in your brief.`}
                            </p>
                          </div>
                        ))}
                    </div>
                    <div className="scaffold-skeleton" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>
                  <div className="scaffold-caption">
                    Layout scaffold only · No generated code or working backend
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="build-live-empty">
              <div className="build-live-icon">↗</div>
              <span className="build-small-label">DEPLOYMENT</span>
              <h2>Your next stop: live.</h2>
              <p>
                No application has been deployed yet. Connect the build and hosting services to turn
                your reviewed brief into a live URL.
              </p>
              <div>
                <span>Build service</span>
                <b>Not connected</b>
                <span>Hosting provider</span>
                <b>Not connected</b>
                <span>Live URL</span>
                <b>Not available</b>
              </div>
              <button onClick={() => setRightTab("preview")} className="build-inline-button">
                Back to preview
              </button>
            </div>
          )}
          <section
            className={`build-terminal ${consoleOpen ? "" : "is-collapsed"}`}
            aria-label="Build console"
          >
            <div className="build-terminal-bar">
              <button onClick={() => setConsoleOpen(!consoleOpen)} aria-expanded={consoleOpen}>
                <span>›_</span> Build console <span>{consoleOpen ? "⌄" : "⌃"}</span>
              </button>
              <span className="build-sim-label">SIMULATED OUTPUT</span>
              <button
                className="build-run"
                onClick={() => {
                  setModule("cost");
                  setRightTab("modules");
                }}
                disabled={running}
              >
                {running ? "Running…" : "Review cost & run"}
              </button>
            </div>
            {consoleOpen && (
              <div className="build-terminal-output" role="log" aria-live="polite">
                <p>
                  <span className="terminal-muted">provn / studio</span>{" "}
                  <span className="terminal-green">$</span> preview --mock
                </p>
                <p className="terminal-muted">
                  Build adapter is not connected. This console simulates lifecycle events.
                </p>
                {step < 0 ? (
                  <p>
                    <span className="terminal-amber">WAIT</span> Ready to simulate. No code
                    execution, spending, or deployment.
                  </p>
                ) : (
                  stages.slice(0, step + 1).map((line, i) => (
                    <p key={line}>
                      <span
                        className={i === stages.length - 1 ? "terminal-amber" : "terminal-green"}
                      >
                        [{i === stages.length - 1 ? "MOCK" : " OK "}]
                      </span>{" "}
                      {line}
                    </p>
                  ))
                )}
                <span className="terminal-cursor">▊</span>
              </div>
            )}
          </section>
          <footer className="build-runtime-footer">
            <span>
              <i />
              {running ? "Simulation running" : "Local preview"}
            </span>
            <span>{demo ? "Demo workspace" : "Draft workspace"} · Nothing published</span>
          </footer>
        </section>
      </div>
    </div>
  );
}
