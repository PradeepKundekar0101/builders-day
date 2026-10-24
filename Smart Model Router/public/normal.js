// Normal mode: a calm, single-column chat. The journey is always
//   prompt -> Route proposes a model and mode -> it starts on its own (or the user changes it)
//   -> reasoning is shown while it works and on demand after -> the user can change and retry.
// Dev mode is the full console in main.js; this file only adds the simple surface and the switch.
import { $, esc, money, md, state, EXAMPLES, localDecision, runTurn, ready } from "./main.js";
import { CATEGORIES } from "./core/catalog.js";
import { EFFORT_LABELS, IMPACT_LABELS } from "./core/classify.js";

const AUTO_START_MS = 3500;
const SUGGESTIONS = EXAMPLES.slice(0, 4);
const MODE_COPY = {
  auto: { label: "Balanced", hint: "Best fit at a sensible cost" },
  quality: { label: "Best quality", hint: "Strongest model, cost matters less" },
  saver: { label: "Save cost", hint: "Cheapest model that can do the job" },
  private: { label: "Private", hint: "Local models only, nothing leaves your machine" },
};

const store = {
  get(k, d) {
    try {
      const v = localStorage.getItem("provn-route:" + k);
      return v ? JSON.parse(v) : d;
    } catch {
      return d;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem("provn-route:" + k, JSON.stringify(v));
    } catch {}
  },
};

// job: { prompt, mode, model ('' = recommended), phase: 'plan'|'running'|'done', editing, whyOpen, decision, reply, superseded }
const ns = { jobs: [], timer: null };

// ---------- Normal / Dev switch ----------
function setUI(ui) {
  document.body.dataset.ui = ui;
  store.set("ui", ui);
  document
    .querySelectorAll("#ui-switch button")
    .forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ui === ui)));
}
$("#ui-switch").addEventListener("click", (e) => {
  const b = e.target.closest("[data-ui]");
  if (b) setUI(b.dataset.ui);
});
const params = new URLSearchParams(location.search);
setUI(
  params.has("dev") ||
    location.hash.slice(1) === "library" ||
    location.hash.slice(1) === "integrate"
    ? "dev"
    : store.get("ui", "normal"),
);

// ---------- reasoning in plain words ----------
function savedPct(d) {
  return d.cost.baseline > 0 ? Math.round((1 - d.cost.estimate / d.cost.baseline) * 100) : 0;
}
function modelOf(d) {
  return d.executing || d.chosen;
}

function reasons(d) {
  const a = d.analysis;
  const m = modelOf(d);
  const out = [
    `This looks like <b>${esc(CATEGORIES[a.category].label.toLowerCase())}</b> work, with ${esc(EFFORT_LABELS[a.effort].toLowerCase())} effort and ${esc(IMPACT_LABELS[a.impact].toLowerCase())} impact.`,
  ];
  if (d.override)
    out.push(`You chose <b>${esc(d.chosen.name)}</b>. My pick was ${esc(d.recommended.name)}.`);
  else
    out.push(
      `<b>${esc(m.name)}</b> is the best fit for this kind of task at the quality it needs.`,
    );
  if (d.mode !== "auto")
    out.push(`${esc(MODE_COPY[d.mode].label)} mode: ${esc(MODE_COPY[d.mode].hint.toLowerCase())}.`);
  const s = savedPct(d);
  out.push(
    s > 0
      ? `About ${money(d.cost.estimate)} for this reply, ${s}% less than the most powerful model.`
      : `About ${money(d.cost.estimate)} for this reply. The extra capability is worth it here.`,
  );
  if (d.executing && d.executingReason) out.push(esc(d.executingReason));
  if (d.guardrails.length) out.push(`Heads up: ${esc(d.guardrails[0])}`);
  return out;
}
const whyList = (d) =>
  `<ul class="nm-why">${reasons(d)
    .map((r) => `<li>${r}</li>`)
    .join("")}</ul>`;

// ---------- conversation ----------
function history(upTo) {
  const msgs = [];
  for (const j of ns.jobs) {
    if (j === upTo) break;
    if (j.superseded || j.phase !== "done") continue;
    msgs.push(
      { role: "user", content: j.prompt },
      { role: "assistant", content: j.reply?.text || "" },
    );
  }
  return msgs;
}
const tokens = (msgs) => msgs.reduce((n, m) => n + Math.ceil(m.content.length / 4), 0);

function plan(job) {
  job.decision = localDecision(job.prompt, tokens(history(job)), {
    mode: job.mode,
    override: job.model ? { model: job.model } : undefined,
  });
  if (job.model && !job.decision.override) job.model = "";
}

function newJob(prompt, from) {
  const job = {
    prompt,
    mode: from?.mode ?? store.get("nm-mode", "auto"),
    model: from?.model ?? "",
    phase: "plan",
    editing: !!from,
    retry: !!from,
    whyOpen: false,
  };
  if (from) from.superseded = true;
  plan(job);
  ns.jobs.push(job);
  render();
  if (!job.editing) arm(job);
  return job;
}

function arm(job) {
  clearTimeout(ns.timer);
  ns.timer = setTimeout(() => start(job), AUTO_START_MS);
}

async function start(job) {
  clearTimeout(ns.timer);
  if (job.phase !== "plan") return;
  job.phase = "running";
  job.editing = false;
  render();
  const msgs = [...history(job), { role: "user", content: job.prompt }];
  const { decision, reply } = await runTurn(
    job.prompt,
    msgs,
    tokens(msgs) - Math.ceil(job.prompt.length / 4),
    {
      mode: job.mode,
      override: job.model ? { model: job.model } : undefined,
    },
  );
  Object.assign(job, { phase: "done", decision, reply });
  render();
}

// ---------- rendering ----------
function changePanel(job, i) {
  const d = job.decision;
  const options = d.alternatives.filter((m) => m.eligible).sort((x, y) => y.score - x.score);
  return `<div class="nm-change">
    <div class="nm-field"><span>Mode</span><div class="nm-chips">${Object.entries(MODE_COPY)
      .map(
        ([id, m]) =>
          `<button type="button" data-act="mode" data-i="${i}" data-v="${id}" aria-pressed="${job.mode === id}" title="${esc(m.hint)}">${esc(m.label)}</button>`,
      )
      .join("")}</div></div>
    <label class="nm-field"><span>Model</span><select data-act="model" data-i="${i}">
      <option value="">Recommended: ${esc(d.recommended.name)}</option>
      ${options
        .filter((m) => m.id !== d.recommended.id)
        .map(
          (m) =>
            `<option value="${esc(m.id)}" ${job.model === m.id ? "selected" : ""}>${esc(m.name)} · ${money(m.estCost)}</option>`,
        )
        .join("")}
    </select></label>
  </div>`;
}

function card(job, i) {
  const d = job.decision;
  const m = modelOf(d);
  const tag = `<b>${esc(m.name)}</b> · ${esc(MODE_COPY[job.mode].label)}`;
  if (job.phase === "plan")
    return `<div class="nm-card plan">
      <div class="nm-plan-head"><span class="nm-eyebrow">Plan</span>${job.editing ? "" : '<span class="nm-auto">Starting automatically</span>'}</div>
      <p class="nm-plan-line">I'll use ${tag}.</p>
      <p class="nm-sub">${reasons(d)[1]}</p>
      ${job.editing ? changePanel(job, i) : `<div class="nm-countdown"><i style="animation-duration:${AUTO_START_MS}ms"></i></div>`}
      <div class="nm-actions">
        <button type="button" class="btn" data-act="start" data-i="${i}">${job.editing ? "Start" : "Start now"}</button>
        ${job.editing ? "" : `<button type="button" class="btn ghost" data-act="edit" data-i="${i}">Change</button>`}
      </div></div>`;
  if (job.phase === "running")
    return `<div class="nm-card">
      <p class="nm-plan-line"><span class="spin"></span> Working on it with ${tag}</p>
      <div class="nm-eyebrow">Why this model</div>${whyList(d)}</div>`;
  const r = job.reply || {};
  const text =
    r.demo && !r.error
      ? `This is a demo reply, so no model was called. Connect a provider in Dev mode and **${modelOf(job.decision).name}** will answer here.`
      : r.text;
  const cost = r.demo ? job.decision.cost.estimate : r.cost;
  return `<div class="nm-reply ${job.superseded ? "old" : ""}">
      <div class="bubble">${md(text)}</div>
      <div class="nm-meta"><span>${esc(r.modelName || m.name)} · ${esc(MODE_COPY[job.mode].label)} · ${r.demo ? "~" : ""}${money(cost)}</span>
        <button type="button" class="nm-link" data-act="why" data-i="${i}" aria-expanded="${job.whyOpen}">Why this model?</button>
        ${job.superseded ? "" : `<button type="button" class="nm-link" data-act="retry" data-i="${i}">Change and retry</button>`}</div>
      ${job.whyOpen ? `<div class="nm-card soft">${whyList(job.decision)}</div>` : ""}
    </div>`;
}

function render() {
  const log = $("#nm-log");
  const busy = ns.jobs.some((j) => j.phase !== "done");
  $("#nm-send").disabled = busy;
  document.querySelector("#view-normal").classList.toggle("started", ns.jobs.length > 0);
  if (!ns.jobs.length) {
    log.innerHTML = `<div class="nm-hero">
      <h2>What do you want to get done?</h2>
      <p class="muted">Describe the task. Route picks the right model, tells you why, and you can always change it.</p>
      <div class="nm-suggest">${SUGGESTIONS.map((x) => `<button type="button" data-ex="${esc(x)}">${esc(x)}</button>`).join("")}</div></div>`;
  } else {
    log.innerHTML = ns.jobs
      .map(
        (j, i) =>
          (j.retry
            ? ""
            : `<div class="msg user"><div class="bubble">${esc(j.prompt).replace(/\n/g, "<br>")}</div></div>`) +
          card(j, i),
      )
      .join("");
  }
  const demo = !state.api || (!state.connected.size && !state.local.on && !state.byo.length);
  $("#nm-foot").textContent = demo
    ? "Demo mode: Route picks real models, but replies are simulated until a provider is connected."
    : "";
  if (ns.jobs.length) log.lastElementChild?.scrollIntoView({ block: "end", behavior: "smooth" });
}

$("#nm-log").addEventListener("click", (e) => {
  const ex = e.target.closest("[data-ex]");
  if (ex) {
    newJob(ex.dataset.ex);
    return;
  }
  const b = e.target.closest("[data-act]");
  if (!b || b.tagName === "SELECT") return;
  const job = ns.jobs[+b.dataset.i];
  const act = b.dataset.act;
  if (act === "start") start(job);
  else if (act === "edit") {
    clearTimeout(ns.timer);
    job.editing = true;
    render();
  } else if (act === "mode") {
    job.mode = b.dataset.v;
    store.set("nm-mode", job.mode);
    plan(job);
    render();
  } else if (act === "why") {
    job.whyOpen = !job.whyOpen;
    render();
  } else if (act === "retry") newJob(job.prompt, job);
});
$("#nm-log").addEventListener("change", (e) => {
  const s = e.target.closest('select[data-act="model"]');
  if (!s) return;
  const job = ns.jobs[+s.dataset.i];
  job.model = s.value;
  plan(job);
  render();
});

$("#nm-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const p = $("#nm-prompt").value.trim();
  if (!p || $("#nm-send").disabled) return;
  $("#nm-prompt").value = "";
  newJob(p);
});
$("#nm-prompt").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    $("#nm-form").requestSubmit();
  }
});
$("#nm-new").addEventListener("click", () => {
  clearTimeout(ns.timer);
  ns.jobs = [];
  render();
  $("#nm-prompt").focus();
});

ready.then(render);
