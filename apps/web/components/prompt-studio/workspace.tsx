"use client";
import { ProvnLogo } from "@/components/provn-logo";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { PromptStudioDraft } from "@buildwise/shared";
import "./workspace.css";
import { P0Panels, useProvnDemo, type P0Module } from "./p0-panels";

type Props = {
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
  const [leftTab, setLeftTab] = useState<"chat" | "brief">(draft.onboarding?.mode === "dev" ? "brief" : "chat");
  const [rightTab, setRightTab] = useState<"preview" | "live" | "modules">("preview");
  const journey = useProvnDemo(draft, reviewed);
  const [module, setModule] = useState<P0Module>("cost");
  const [message, setMessage] = useState("");
  const [localError, setLocalError] = useState("");
  const [notes, setNotes] = useState<string[]>([]);
  const [step, setStep] = useState(-1);
  const [running, setRunning] = useState(false);
  const [mobile, setMobile] = useState(false);
  const [page, setPage] = useState(0);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const bottom = useRef<HTMLDivElement>(null);
  const next = draft.questions.find((q) => !q.answer?.trim());
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
  function send() {
    const text = message.trim();
    if (!text || busy) return;
    setLocalError("");
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
          Mock environment
        </span>
        <button onClick={onSave} disabled={busy} className="build-quiet-button">
          Save draft
        </button>
        <button onClick={onExport} disabled={busy} className="build-export">
          Export brief ↗
        </button>
      </header>
      <nav className="provn-stage-path" aria-label="Build stages">
        {['Brief', 'Estimate', 'Build', 'Deploy', 'Security review', 'Proof'].map((label, i) => <span key={label}>{String(i + 1).padStart(2, '0')} <b>{label}</b>{i < 5 && <i aria-hidden="true">→</i>}</span>)}
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
            <span className="build-small-label">
              {answered}/{draft.questions.length} decisions
            </span>
          </div>
          {(error || localError) && (
            <p role="alert" className="build-error">
              {error || localError}
            </p>
          )}
          {notice && notice !== "Unsaved changes" && (
            <p role="status" className="build-notice">
              {notice}
            </p>
          )}
          {leftTab === "brief" ? (
            <div className="build-brief-scroll">{editor}</div>
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
                    <span className="build-agent-tag">GUIDE · MOCK</span>
                  </div>
                  <p>
                    Let’s turn this into something you can build. I’ll help you work through the
                    important decisions, one at a time.
                  </p>
                  <div className="build-plan">
                    <span>THE PLAN</span>
                    <div>
                      <i>01</i>Understand your users
                    </div>
                    <div>
                      <i>02</i>Define the first complete journey
                    </div>
                    <div>
                      <i>03</i>Agree on data and connections
                    </div>
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
                {!next && (
                  <article className="build-message">
                    <div className="build-message-label">
                      <span className="build-avatar">✦</span>PROVN
                      <span>Ready for your review</span>
                    </div>
                    <p>
                      That gives us a clear starting point. Review the product brief and the exact
                      model instructions before handing this to your builder.
                    </p>
                    <button className="build-inline-button" onClick={() => setLeftTab("brief")}>
                      Review brief & prompts ↗
                    </button>
                    <p className="build-message-note">
                      The right panel is a visual scaffold. The mock does not generate or deploy
                      working applications.
                    </p>
                  </article>
                )}
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
                  {next ? "Agent is waiting for your answer" : "Your brief is ready to refine"}
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
                <span>No model calls · No credits used</span>
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
                    {draft.spec.pages.map((p, i) => (
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
                      {["Primary journey", "Your data", "Connections"].map((title, i) => (
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
