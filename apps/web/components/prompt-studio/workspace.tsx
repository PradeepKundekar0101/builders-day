"use client";
import {
  acceptBuildEvent,
  type StudioBuildConnection,
  type StudioBuildState,
} from "@/lib/prompt-studio/build-events";
import { WorkspaceNav, type WorkspaceView } from "./workspace-nav";
import { BuildJourney, type JourneyAttack } from "./build-journey";
import { ProvnLogo } from "@/components/provn-logo";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isLiveAdapterMode, type PromptStudioDraft } from "@buildwise/shared";
import "./workspace.css";
import { P0Panels, useProvnDemo, type P0Module } from "./p0-panels";
import { SitePreview } from "@/components/demo/site-preview";
import type { SecurityReview } from "@/lib/demo/agenticorg";
import { fixSteps, type AttackResult } from "@/lib/demo/attack";
import { attackSchedule, DEMO_TIMING, stepFinishTimes } from "@/lib/demo/timing";
import { planFromIdea } from "@/lib/demo/plan";
import { questionOptions } from "@/lib/demo/question-options";

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
  "Generating the data model",
  "Scaffolding pages and components",
  "Wiring sign-in and permissions",
  "Installing dependencies",
  "Running type checks and tests",
  "Checking preview layout",
  "Simulation complete. No application deployed.",
];
/** Relative length of each build stage after the first; scaffolding, installs and tests take longest. */
const stageWeights = [1, 1.2, 1.8, 1.2, 1.6, 2, 1, 0.6];
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
  const [previewSelected, setPreviewSelected] = useState(false);
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
  const [appPage, setAppPage] = useState("Home");
  const [attack, setAttack] = useState<JourneyAttack>({ kind: "idle" });
  const [review, setReview] = useState<SecurityReview | null | undefined>(undefined);
  const attackTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const terminal = useRef<HTMLDivElement>(null);
  useEffect(() => {
    terminal.current?.scrollTo({ top: terminal.current.scrollHeight });
  }, [attack, step]);
  useEffect(() => () => attackTimers.current.forEach(clearTimeout), []);
  const appPlan = useMemo(() => {
    const plan = planFromIdea(draft.input.idea);
    // The mock brief names every product "My product"; the idea gives a better name until edited.
    return draft.spec.name === "My product" ? plan : { ...plan, name: draft.spec.name };
  }, [draft.input.idea, draft.spec.name]);
  const appSlug = appPlan.name.toLowerCase().replace(/[^a-z0-9]+/g, "-");
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
        if (isLiveAdapterMode(draft.adapterMode))
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
  // The simulated build has run to its last stage: show the built app instead of the wireframe.
  const built = step >= stages.length - 1 && !running;
  // When a build finishes, show the result instead of the panel that started it.
  const wasBuilt = useRef(built);
  useEffect(() => {
    if (built && !wasBuilt.current) {
      setRightTab("preview");
      setPreviewSelected(true);
      setAppPage("Home");
      setAttack({ kind: "idle" });
    }
    wasBuilt.current = built;
  }, [built]);
  const needsFix = attack.kind === "done" && attack.result.grade !== "A";
  const fixing =
    attack.kind === "running" && !!attack.fix && attack.fix.done < attack.fix.steps.length;
  // The probe in flight; after the last one, it stays on screen while the grade is scored.
  const probe =
    attack.kind === "running" && !fixing
      ? attack.result.probes[Math.min(attack.shown, attack.result.probes.length - 1)]
      : undefined;
  async function runAttack(hardened: boolean) {
    setConsoleOpen(true);
    const response = await fetch("/api/demo/attack", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ idea: draft.input.idea, hardened }),
    }).catch(() => null);
    if (!response?.ok) {
      setLocalError("The attack simulation did not start. Try again.");
      return;
    }
    const result = (await response.json()) as AttackResult;
    // The first attack also asks the real AgenticOrg agent for its review, in parallel.
    if (!hardened) {
      setReview(undefined);
      void fetch("/api/demo/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ idea: draft.input.idea, name: appPlan.name }),
      })
        .then((r) => (r.ok ? (r.json() as Promise<{ review: SecurityReview | null }>) : null))
        .then((body) => setReview(body?.review ?? null))
        .catch(() => setReview(null));
    }
    const steps = hardened ? fixSteps(result) : [];
    const fix = (done: number) => (hardened ? { steps, done } : undefined);
    const { ticks, doneAt } = attackSchedule(result.probes.length, steps.length, hardened);
    attackTimers.current.forEach(clearTimeout);
    setAttack({ kind: "running", result, shown: 0, fix: fix(0) });
    attackTimers.current = [
      ...ticks.map((tick) =>
        setTimeout(
          () => setAttack({ kind: "running", result, shown: tick.shown, fix: fix(tick.fixDone) }),
          tick.at,
        ),
      ),
      setTimeout(() => setAttack({ kind: "done", result }), doneAt),
    ];
  }
  const answered = draft.questions.filter((q) => q.answer?.trim()).length;
  const activePage = draft.spec.pages[Math.min(page, draft.spec.pages.length - 1)];
  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "nearest" });
  }, [answered, notes.length]);
  useEffect(() => {
    if (!running) return;
    const finishTimes = stepFinishTimes(
      DEMO_TIMING.buildMs,
      stages.length - 1,
      (i) => stageWeights[i] ?? 1,
    );
    const timers = finishTimes.map((at, i) =>
      setTimeout(() => {
        setStep(i + 1);
        if (i === finishTimes.length - 1) setRunning(false);
      }, at),
    );
    return () => timers.forEach(clearTimeout);
  }, [running]);
  /** Sends the typed message, or a suggested answer the user clicked. */
  async function send(answer?: string) {
    const text = (answer ?? message).trim();
    if (!text || busy) return;
    setLocalError("");
    if (isLiveAdapterMode(draft.adapterMode)) {
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
    <div className="conduit-build-workspace has-left-nav">
      <WorkspaceNav
        project={draft.spec.name}
        active={
          rightTab === "modules"
            ? module
            : previewSelected
              ? "preview"
              : leftTab === "brief"
                ? "brief"
                : "chat"
        }
        onSelect={(view: WorkspaceView) => {
          setPreviewSelected(view === "preview");
          if (view === "chat" || view === "brief") {
            setLeftTab(view);
            setRightTab("preview");
          } else if (view === "preview") setRightTab("preview");
          else {
            setModule(view);
            setRightTab("modules");
          }
        }}
      />
      <div className="provn-work-area">
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
            {isLiveAdapterMode(draft.adapterMode) ? "Live intake · draft preview" : "Mock environment"}
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
                <button
                  aria-pressed={leftTab === "chat"}
                  onClick={() => {
                    setLeftTab("chat");
                    setPreviewSelected(false);
                  }}
                >
                  ✦ Agent chat
                </button>
                <button
                  aria-pressed={leftTab === "brief"}
                  onClick={() => {
                    setLeftTab("brief");
                    setPreviewSelected(false);
                  }}
                >
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
                        {isLiveAdapterMode(draft.adapterMode) ? "GUIDE · LIVE AI" : "GUIDE · MOCK"}
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
                  {draft.questions.length > 0 && draft.questions.every((q) => q.answer?.trim()) && (
                    <BuildJourney
                      plan={appPlan}
                      building={running}
                      progress={`${Math.max(step, 0) + 1}/${stages.length} · ${stages[Math.min(step + 1, stages.length - 1)]}`}
                      built={built}
                      attack={attack}
                      review={review}
                      onBuild={() => {
                        setStep(0);
                        setRunning(true);
                        setConsoleOpen(true);
                      }}
                      onAttack={(hardened) => void runAttack(hardened)}
                    />
                  )}
                  {notes.map((note, i) => (
                    <article className="build-message build-message-user" key={i}>
                      <div className="build-message-label">
                        <span className="build-avatar user">Y</span>You
                        <span>Additional requirement</span>
                      </div>
                      <p>{note}</p>
                      <small>
                        Added to your original product intent. Update the brief to reflect any
                        feature changes.
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
                  {next && (
                    <div
                      className="build-answer-options"
                      role="group"
                      aria-label="Suggested answers"
                    >
                      {questionOptions(next.id, appPlan).map((option) => (
                        <button
                          type="button"
                          key={option}
                          disabled={busy}
                          onClick={() => void send(option)}
                        >
                          {option}
                        </button>
                      ))}
                    </div>
                  )}
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
                    placeholder={next ? "Or type your own answer…" : "Add another requirement…"}
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
                    {isLiveAdapterMode(draft.adapterMode)
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
                <button
                  aria-pressed={rightTab === "preview"}
                  onClick={() => setRightTab("preview")}
                >
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
                {built && (
                  <button
                    className="build-attack"
                    onClick={() => runAttack(needsFix)}
                    disabled={attack.kind === "running"}
                    title="Simulated attack against the built app"
                  >
                    {needsFix ? "✓ Fix & re-attack" : "⚠ Attack"}
                  </button>
                )}
                <button
                  className="build-deploy"
                  disabled
                  title="Connect the deployment service to publish"
                >
                  ↑ Publish
                </button>
              </div>
            </div>
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
            ) : rightTab === "preview" && built ? (
              <>
                <div className="build-address">
                  <span className="build-window-dots">
                    <i />
                    <i />
                    <i />
                  </span>
                  <span>
                    https://{appSlug}.provn.app/
                    {appPage === "Home" ? "" : appPage.toLowerCase().replaceAll(" ", "-")}
                  </span>
                  <span className="build-wireframe-tag">SIMULATED BUILD</span>
                </div>
                <div className="build-preview-stage">
                  <div
                    className={`build-app-surface build-app-built ${mobile ? "is-mobile" : ""} ${probe ? "is-under-attack" : ""}`}
                    key={refreshKey}
                    aria-label="Built app preview"
                  >
                    <SitePreview
                      plan={appPlan}
                      page={appPage}
                      onNavigate={setAppPage}
                      revealed={appPlan.pages.length}
                    />
                    {probe && (
                      <div role="status" className="build-attack-probe">
                        <p>
                          ▶ {probe.name} → {probe.target}
                        </p>
                        <p>{probe.payload}</p>
                      </div>
                    )}
                  </div>
                </div>
              </>
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
                  <div
                    className={`build-app-surface ${mobile ? "is-mobile" : ""}`}
                    key={refreshKey}
                  >
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
                  No application has been deployed yet. Connect the build and hosting services to
                  turn your reviewed brief into a live URL.
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
                <div className="build-terminal-output" role="log" aria-live="polite" ref={terminal}>
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
                  {built && (
                    <p>
                      <span className="terminal-green">PREVIEW</span> {appSlug}.provn.app ·
                      simulated app, not deployed
                    </p>
                  )}
                  {attack.kind === "running" &&
                    attack.fix?.steps.slice(0, attack.fix.done + 1).map((line, i) => (
                      <p key={line}>
                        <span
                          className={i < attack.fix!.done ? "terminal-green" : "terminal-amber"}
                        >
                          [{i < attack.fix!.done ? " FIX" : "...."}]
                        </span>{" "}
                        {line}
                      </p>
                    ))}
                  {attack.kind !== "idle" && (
                    <div aria-label="Attack results">
                      {attack.result.probes
                        .slice(0, attack.kind === "running" ? attack.shown : undefined)
                        .map((p) => (
                          <p key={p.id}>
                            <span
                              className={p.outcome === "found" ? "terminal-red" : "terminal-green"}
                            >
                              [{p.outcome === "found" ? "VULN" : "BLOCK"}]
                            </span>{" "}
                            {p.name}: {p.detail}
                          </p>
                        ))}
                      {attack.kind === "done" && (
                        <p>
                          <span
                            className={
                              attack.result.grade === "A" ? "terminal-green" : "terminal-red"
                            }
                          >
                            GRADE {attack.result.grade}
                          </span>{" "}
                          {attack.result.grade === "A"
                            ? "Every attack blocked. Ready to publish."
                            : "One issue found. "}
                          {attack.result.grade !== "A" && (
                            <button className="build-inline-button" onClick={() => runAttack(true)}>
                              Apply fix and attack again
                            </button>
                          )}
                        </p>
                      )}
                    </div>
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
    </div>
  );
}
