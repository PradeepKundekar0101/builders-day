"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { fixSteps, type AttackResult, type Probe } from "@/lib/demo/attack";
import { attackSchedule, DEMO_TIMING, stepFinishTimes } from "@/lib/demo/timing";
import type { Plan } from "@/lib/demo/plan";
import { SitePreview } from "@/components/demo/site-preview";

type Phase = "idea" | "estimating" | "estimated" | "building" | "built";
type AttackState =
  | { kind: "idle" }
  | {
      kind: "running";
      result: AttackResult;
      shown: number;
      /** Set on a fix and re-attack: the fix steps, and how many have finished. */
      fix?: { steps: string[]; done: number };
    }
  | { kind: "done"; result: AttackResult; hardened: boolean };

const EXAMPLES = [
  "A tiffin order tracker for my home kitchen. Customers sign in, pick meals for the week and pay online; I see each day's orders.",
  "A booking platform for my yoga studio where students reserve a spot in a class and get an email reminder.",
  "A client portal for my design agency where clients upload files, see invoices and track tasks on their projects.",
];

const usd = (value: number) => `$${value.toFixed(2)}`;
const hoursText = (hours: number) =>
  hours < 1
    ? "under an hour"
    : Number.isInteger(hours)
      ? `about ${hours} ${hours === 1 ? "hour" : "hours"}`
      : `about ${Math.floor(hours)} to ${Math.ceil(hours)} hours`;
const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-");

function buildSteps(plan: Plan) {
  return [
    "Scaffolding a Next.js app",
    ...plan.pages.map((page) => `Building the ${page} page`),
    ...plan.entities.map(
      (entity) => `Creating the ${entity.toLowerCase()} table with row-level security`,
    ),
    ...plan.features
      .filter((f) => !["pages", "data"].includes(f.key))
      .map((f) => `Wiring ${f.label.toLowerCase()}`),
    "Running tests",
    `Deploying to ${slug(plan.name)}.provn.app`,
  ];
}

async function post<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(
      ((await response.json().catch(() => ({}))) as { error?: string }).error ?? "Try again.",
    );
  return (await response.json()) as T;
}

export function DemoStudio() {
  const [idea, setIdea] = useState("");
  const [phase, setPhase] = useState<Phase>("idea");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [page, setPage] = useState("Home");
  const [attack, setAttack] = useState<AttackState>({ kind: "idle" });
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const later = (fn: () => void, ms: number) => timers.current.push(setTimeout(fn, ms));

  const steps = plan ? buildSteps(plan) : [];
  // Pages appear in the preview as their build steps finish.
  const revealed =
    phase === "built"
      ? (plan?.pages.length ?? 0)
      : Math.max(0, Math.min(step - 1, plan?.pages.length ?? 0));

  async function estimate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPhase("estimating");
    try {
      setPlan(await post<Plan>("/api/demo/estimate", { idea }));
      setPhase("estimated");
    } catch (e) {
      setError((e as Error).message);
      setPhase("idea");
    }
  }

  function build() {
    if (!plan) return;
    setPhase("building");
    setStep(0);
    setPage("Home");
    // Tests and the deploy take longer than the other steps.
    const slow = steps.length - 2;
    const finishTimes = stepFinishTimes(DEMO_TIMING.buildMs, steps.length, (i) =>
      i >= slow ? 2.2 : 1,
    );
    finishTimes.forEach((at, i) => later(() => setStep(i + 1), at));
    later(() => setPhase("built"), DEMO_TIMING.buildMs + 600);
  }

  async function runAttack(hardened: boolean) {
    setError(null);
    try {
      const result = await post<AttackResult>("/api/demo/attack", { idea, hardened });
      const fixes = hardened ? fixSteps(result) : [];
      const fix = (done: number) => (hardened ? { steps: fixes, done } : undefined);
      const { ticks, doneAt } = attackSchedule(result.probes.length, fixes.length, hardened);
      setAttack({ kind: "running", result, shown: 0, fix: fix(0) });
      ticks.forEach((tick) =>
        later(
          () => setAttack({ kind: "running", result, shown: tick.shown, fix: fix(tick.fixDone) }),
          tick.at,
        ),
      );
      later(() => setAttack({ kind: "done", result, hardened }), doneAt);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function reset() {
    timers.current.forEach(clearTimeout);
    setPhase("idea");
    setPlan(null);
    setAttack({ kind: "idle" });
    setStep(0);
  }

  const fixing =
    attack.kind === "running" && !!attack.fix && attack.fix.done < attack.fix.steps.length;
  // The probe in flight; after the last one, it stays on screen while the grade is scored.
  const current =
    attack.kind === "running" && !fixing
      ? attack.result.probes[Math.min(attack.shown, attack.result.probes.length - 1)]
      : undefined;
  const underAttack = attack.kind === "running" && !fixing;

  return (
    <div className="grid min-h-[calc(100dvh-3.5rem)] gap-4 p-4 lg:grid-cols-[minmax(320px,420px)_1fr]">
      <section aria-label="Build steps" className="flex flex-col gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-go">
            PROVN demo · simulated
          </p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight">From idea to a tested app</h1>
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
          >
            {error}
          </p>
        )}

        {(phase === "idea" || phase === "estimating") && (
          <form onSubmit={estimate} className="rounded-xl border border-rule bg-surface p-4">
            <label htmlFor="demo-idea" className="text-sm font-medium">
              Describe your app
            </label>
            <textarea
              id="demo-idea"
              rows={6}
              maxLength={2000}
              value={idea}
              onChange={(event) => setIdea(event.target.value)}
              placeholder="Who is it for, and what do they do with it?"
              className="mt-1.5 w-full resize-y rounded-lg border border-rule bg-paper p-3 text-base leading-relaxed outline-none placeholder:text-slate/60 focus:border-go"
            />
            <div className="mt-2 flex flex-wrap gap-2">
              {EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => setIdea(example)}
                  className="rounded-full border border-rule px-3 py-1 text-xs text-slate hover:border-go hover:text-ink"
                >
                  {example.split(" for ")[0]}
                </button>
              ))}
            </div>
            <button
              type="submit"
              disabled={idea.trim().length < 20 || phase === "estimating"}
              className="mt-4 h-11 w-full rounded-lg bg-go font-semibold text-paper hover:bg-go-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === "estimating" ? "Estimating" : "Estimate my app"}
            </button>
          </form>
        )}

        {plan && phase !== "idea" && phase !== "estimating" && (
          <div className="rounded-xl border border-rule bg-surface p-4">
            <p className="text-sm text-slate">Estimate for</p>
            <h2 className="text-lg font-bold">{plan.name}</h2>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs text-slate">Cost (approximate)</p>
                <p className="text-3xl font-extrabold text-go" data-testid="demo-cost">
                  {usd(plan.costUsd)}
                </p>
              </div>
              <div className="text-sm text-slate sm:text-right">
                <p data-testid="demo-time">{hoursText(plan.hours)}</p>
                <p>
                  range {usd(plan.lowUsd)} to {usd(plan.highUsd)}
                </p>
              </div>
            </div>
            <ul className="mt-3 divide-y divide-rule border-t border-rule text-sm">
              {plan.features.map((feature) => (
                <li key={feature.key} className="flex justify-between gap-3 py-1.5">
                  <span>{feature.label}</span>
                  <span className="shrink-0 text-slate">
                    {feature.hours} h · {usd(feature.usd)}
                  </span>
                </li>
              ))}
              <li className="flex justify-between gap-3 py-1.5">
                <span>Deploy and hosting setup</span>
                <span className="shrink-0 text-slate">{usd(plan.deployUsd)}</span>
              </li>
            </ul>
            {phase === "estimated" && (
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={build}
                  className="h-11 flex-1 rounded-lg bg-go font-semibold text-paper hover:bg-go-hover"
                >
                  Build it
                </button>
                <button
                  type="button"
                  onClick={reset}
                  className="h-11 rounded-lg border border-rule px-4 text-sm font-semibold hover:border-ink"
                >
                  Change idea
                </button>
              </div>
            )}
          </div>
        )}

        {(phase === "building" || phase === "built") && (
          <div className="rounded-xl border border-rule bg-surface p-4">
            <div className="flex items-center justify-between">
              <h2 className="font-bold">Build</h2>
              <span className="text-sm text-slate">
                {Math.min(step, steps.length)}/{steps.length}
              </span>
            </div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden="true">
              <div
                className="h-full bg-go transition-[width] duration-500"
                style={{ width: `${(Math.min(step, steps.length) / steps.length) * 100}%` }}
              />
            </div>
            <ol aria-label="Build log" className="mt-3 space-y-1 font-mono text-xs">
              {steps.slice(0, step).map((line) => (
                <li key={line} className="text-slate">
                  <span className="text-go">✓</span> {line}
                </li>
              ))}
              {phase === "building" && step < steps.length && (
                <li className="animate-pulse text-ink">› {steps[step]}</li>
              )}
            </ol>
            {phase === "built" && (
              <p role="status" className="mt-3 text-sm font-semibold text-go">
                Live at {slug(plan!.name)}.provn.app
              </p>
            )}
          </div>
        )}

        {phase === "built" && (
          <div className="rounded-xl border border-rule bg-surface p-4">
            <h2 className="font-bold">Security check</h2>
            <p className="mt-1 text-sm text-slate">
              Attack the live app the way a real attacker would. Simulated: no traffic leaves this
              demo.
            </p>
            {attack.kind === "idle" && (
              <button
                type="button"
                onClick={() => runAttack(false)}
                className="mt-3 h-11 w-full rounded-lg bg-danger font-semibold text-paper hover:opacity-90"
              >
                Attack my app
              </button>
            )}
            {attack.kind === "running" && attack.fix && (
              <ol aria-label="Fix log" className="mt-3 space-y-1 font-mono text-xs">
                {attack.fix.steps.slice(0, attack.fix.done).map((line) => (
                  <li key={line} className="text-slate">
                    <span className="text-go">✓</span> {line}
                  </li>
                ))}
                {fixing && (
                  <li className="animate-pulse text-ink">› {attack.fix.steps[attack.fix.done]}</li>
                )}
              </ol>
            )}
            {attack.kind === "running" && !fixing && (
              <p role="status" className="mt-3 animate-pulse font-mono text-xs text-ink">
                {attack.shown < attack.result.probes.length
                  ? `› ${attack.fix ? "Re-attacking" : "Attacking"} ${attack.shown + 1}/${attack.result.probes.length}: ${current?.name}`
                  : "› Scoring the results"}
              </p>
            )}
            {attack.kind !== "idle" && !fixing && (
              <AttackLog
                probes={attack.result.probes.slice(
                  0,
                  attack.kind === "running" ? attack.shown : undefined,
                )}
              />
            )}
            {attack.kind === "done" && (
              <div className="mt-3">
                <p role="status" className="text-sm font-semibold">
                  Security grade{" "}
                  <span className={attack.result.grade === "A" ? "text-go" : "text-danger"}>
                    {attack.result.grade}
                  </span>
                  {attack.result.grade === "A"
                    ? " · every attack blocked. Ready to publish."
                    : " · one issue found. Fix it before publishing."}
                </p>
                {attack.result.grade !== "A" ? (
                  <button
                    type="button"
                    onClick={() => runAttack(true)}
                    className="mt-3 h-11 w-full rounded-lg bg-go font-semibold text-paper hover:bg-go-hover"
                  >
                    Apply fix and attack again
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={reset}
                    className="mt-3 h-11 w-full rounded-lg border border-rule font-semibold hover:border-ink"
                  >
                    Try another idea
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      <section
        aria-label="App preview"
        className={`flex min-h-[480px] flex-col overflow-hidden rounded-xl border bg-surface transition-colors lg:sticky lg:top-4 lg:h-[calc(100dvh-5.5rem)] ${underAttack ? "border-danger shadow-[0_0_0_3px_rgb(239_155_153/0.35)]" : "border-rule"}`}
      >
        <div className="flex items-center gap-2 border-b border-rule px-3 py-2">
          <span className="flex gap-1.5" aria-hidden="true">
            <span className="h-3 w-3 rounded-full bg-[#ef9b99]" />
            <span className="h-3 w-3 rounded-full bg-[#e5bd8b]" />
            <span className="h-3 w-3 rounded-full bg-[#8fc9a3]" />
          </span>
          <span className="min-w-0 flex-1 truncate rounded-md bg-paper px-3 py-1 text-xs text-slate">
            {plan && (phase === "building" || phase === "built")
              ? `https://${slug(plan.name)}.provn.app/${page === "Home" ? "" : slug(page)}`
              : "Your app will appear here"}
          </span>
        </div>
        <div className="relative flex-1 overflow-auto">
          {plan && (phase === "building" || phase === "built") ? (
            revealed > 0 ? (
              <SitePreview plan={plan} page={page} onNavigate={setPage} revealed={revealed} />
            ) : (
              <p className="p-6 text-sm text-slate">Scaffolding…</p>
            )
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-slate">
              <p className="font-semibold text-ink">No app yet</p>
              <p className="max-w-xs text-sm">
                Describe an idea and approve the estimate. The built app renders here, page by page.
              </p>
            </div>
          )}
          {current && (
            <div
              role="status"
              className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-danger bg-[#1d2630]/95 p-3 font-mono text-xs text-[#f3f0e9] shadow-lg"
            >
              <p className="text-danger">
                ▶ {current.name} → {current.target}
              </p>
              <p className="mt-1 truncate text-[#bbc3cc]">{current.payload}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AttackLog({ probes }: { probes: Probe[] }) {
  return (
    <ul aria-label="Attack results" className="mt-3 space-y-2">
      {probes.map((probe) => (
        <li
          key={probe.id}
          className={`rounded-lg border p-2.5 text-sm ${probe.outcome === "found" ? "border-danger/60 bg-danger/10" : "border-rule"}`}
        >
          <p className="flex items-center justify-between gap-2 font-medium">
            {probe.name}
            <span
              className={`shrink-0 text-xs font-semibold ${probe.outcome === "found" ? "text-danger" : "text-go"}`}
            >
              {probe.outcome === "found" ? "Vulnerable" : "Blocked"}
            </span>
          </p>
          <p className="mt-0.5 text-xs text-slate">{probe.detail}</p>
        </li>
      ))}
    </ul>
  );
}
