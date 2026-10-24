// Provn Route console. Talks to /api/* when deployed; falls back to running the
// router in the browser (preview mode) when the API is not reachable.
import { route, MODES } from './core/router.js';
import { MODELS, CATEGORIES, TIERS, RUNTIMES, byoToModel } from './core/catalog.js';
import { EFFORT_LABELS, IMPACT_LABELS } from './core/classify.js';

export const $ = s => document.querySelector(s);
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = n => n == null ? '—' : n === 0 ? '$0.00' : n < 0.001 ? `$${n.toFixed(5)}` : n < 1 ? `$${n.toFixed(4)}` : `$${n.toFixed(2)}`;
const ktok = n => n >= 1e6 ? `${n / 1e6}M` : `${Math.round(n / 1000)}K`;
const TIER_VAR = { frontier: 'var(--t-frontier)', slm: 'var(--t-slm)', local: 'var(--t-local)' };

const store = {
  get(k, d) { try { const v = localStorage.getItem('provn-route:' + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('provn-route:' + k, JSON.stringify(v)); } catch {} },
};

export const EXAMPLES = [
  'Build an end-to-end checkout with Pine Labs payments, refunds and webhook handling in Next.js',
  'Research and compare the top 5 vector databases for an early-stage startup, with pros and cons',
  'Write 5 launch taglines for Provn, a platform where every build is proven',
  'Extract name, email and amount from these invoices into JSON: Asha Rao, asha@acme.in, 4,500',
  'Rename all variables in this file to camelCase',
  'Refactor our React dashboard component to use hooks and add unit tests',
];

export const state = {
  api: false,
  connected: new Set(),
  classifier: 'heuristic',
  mode: store.get('mode', 'auto'),
  override: '',
  turns: [],          // { role, content, decision?, reply?, attempts? }
  selected: -1,
  byo: store.get('byo', []),
  local: store.get('local', { on: false, url: 'http://localhost:11434' }),
  secret: store.get('secret', ''),
  view: 'console',
};

// ---------- boot ----------
async function boot() {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    const r = await fetch('./api/catalog', { signal: ctl.signal, headers: headers() });
    clearTimeout(t);
    if (!r.ok) throw new Error(r.status);
    const j = await r.json();
    state.api = true;
    state.classifier = j.classifier;
    state.connected = new Set(Object.entries(j.runtimes).filter(([id, v]) => v.connected && id !== 'byo').map(([id]) => id));
    if (!store.get('mode', null) && j.defaultMode) state.mode = j.defaultMode;
  } catch {
    state.api = false;
  }
  renderStatus();
  renderModes();
  renderOverride();
  renderLog();
  renderSheet();
  renderLibrary();
  renderIntegrate();
  const v = (location.hash || '').slice(1);
  if (['console', 'library', 'integrate'].includes(v)) show(v);
}

function headers() {
  const h = { 'content-type': 'application/json' };
  if (state.secret) h['x-provn-key'] = state.secret;
  return h;
}

function available() {
  if (!state.api) return undefined; // preview: assume everything is connected
  const a = new Set(state.connected);
  if (state.local.on) a.add('ollama');
  return [...a];
}

function overrideOpt() {
  if (!state.override) return undefined;
  if (state.override.startsWith('tier:')) return { tier: state.override.slice(5) };
  return { model: state.override };
}

// opts.mode / opts.override let Normal mode route with its own choices instead of the Dev console's.
export function localDecision(prompt, contextTokens = 0, opts = {}) {
  const mode = opts.mode ?? state.mode;
  const override = 'override' in opts ? opts.override : overrideOpt();
  return route({ prompt, contextTokens }, { mode, override, available: available(), byo: state.byo });
}

// ---------- status + controls ----------
function renderStatus() {
  const runtimes = ['anthropic', 'openai', 'gemini', 'hf', 'ollama'];
  const on = id => state.api ? (state.connected.has(id) || (id === 'ollama' && state.local.on)) : false;
  $('#status').innerHTML = runtimes.map(id =>
    `<span class="pill"><span class="dot ${on(id) ? 'on' : ''}"></span>${esc(RUNTIMES[id].label)}</span>`).join('');
  const b = $('#banner');
  if (!state.api) {
    b.hidden = false;
    b.innerHTML = '<b>Preview mode.</b> The router is running in your browser, so decisions are real but replies are simulated. Deploy with your API keys to get live answers.';
  } else if (!state.connected.size && !state.local.on && !state.byo.length) {
    b.hidden = false;
    b.innerHTML = '<b>No providers connected.</b> Decisions work, replies are simulated. Add keys in your Vercel environment variables (see Integrate).';
  } else b.hidden = true;
}

function renderModes() {
  $('#modes').innerHTML = Object.entries(MODES).map(([id, m]) =>
    `<button type="button" data-mode="${id}" aria-pressed="${state.mode === id}" title="${esc(m.blurb)}">${esc(m.label)}</button>`).join('');
}
$('#modes').addEventListener('click', e => {
  const b = e.target.closest('button[data-mode]'); if (!b) return;
  state.mode = b.dataset.mode; store.set('mode', state.mode);
  renderModes(); live();
});

export function allModels() { return [...MODELS, ...state.byo.map(byoToModel)]; }

function renderOverride() {
  const groups = Object.entries(TIERS).map(([t, info]) => {
    const opts = allModels().filter(m => m.tier === t).map(m =>
      `<option value="${m.id}">${esc(m.name)} · ${esc(m.lab)}</option>`).join('');
    return `<optgroup label="${esc(info.label)}">${opts}</optgroup>`;
  }).join('');
  $('#override').innerHTML = `<option value="">Model: Auto (recommended)</option>
    <optgroup label="Limit to a tier">${Object.entries(TIERS).map(([t, i]) => `<option value="tier:${t}">${esc(i.label)} only</option>`).join('')}</optgroup>${groups}`;
  $('#override').value = state.override;
}
$('#override').addEventListener('change', e => { state.override = e.target.value; live(); });

// ---------- chat ----------
export function md(text) {
  const parts = String(text || '').split(/```(\w*)\n?([\s\S]*?)```/g);
  let out = '';
  for (let i = 0; i < parts.length; i++) {
    if (i % 3 === 1) continue;
    if (i % 3 === 2) { out += `<pre><code>${esc(parts[i])}</code></pre>`; continue; }
    const blocks = parts[i].split(/\n{2,}/).map(b => b.trim()).filter(Boolean);
    for (const b of blocks) {
      const inline = s => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
      const lines = b.split('\n');
      if (lines.every(l => /^\s*([-*•]|\d+[.)])\s+/.test(l))) out += `<ul>${lines.map(l => `<li>${inline(l.replace(/^\s*([-*•]|\d+[.)])\s+/, ''))}</li>`).join('')}</ul>`;
      else out += `<p>${lines.map(inline).join('<br>')}</p>`;
    }
  }
  return out;
}

function routeChip(d, reply) {
  const m = reply && reply.modelName ? { name: reply.modelName } : d.executing || d.chosen;
  const tier = (allModels().find(x => x.id === (reply?.model || d.chosen.id)) || d.chosen).tier;
  const cost = reply && !reply.demo ? reply.cost : d.cost.estimate;
  return `<span class="tierdot" style="background:${TIER_VAR[tier]}"></span><b>${esc(m.name)}</b>
    <span>${esc(TIERS[tier].label)} · ${esc(CATEGORIES[d.analysis.category].label)} · E${d.analysis.effort} I${d.analysis.impact} · ${money(cost)}${reply?.demo ? ' · simulated' : ''}${d.override ? ' · your pick' : ''}</span>`;
}

function renderLog() {
  const log = $('#log');
  if (!state.turns.length) {
    log.innerHTML = `<div class="empty" style="display:grid;gap:12px;justify-items:center">
      <div>Try a task. Route scores job type, effort and impact, then picks a tier and model.</div>
      <div class="examples">${EXAMPLES.map(x => `<button type="button" data-ex="${esc(x)}">${esc(x.length > 58 ? x.slice(0, 56) + '…' : x)}</button>`).join('')}</div></div>`;
    return;
  }
  log.innerHTML = state.turns.map((t, i) => {
    if (t.role === 'user') return `<div class="msg user"><div class="bubble">${esc(t.content).replace(/\n/g, '<br>')}</div></div>`;
    if (t.pending) return `<div class="msg bot"><div class="bubble"><span class="spin"></span> Routing…</div></div>`;
    return `<div class="msg bot ${i === state.selected ? 'selected' : ''}">
      <button type="button" class="routechip" data-sel="${i}" title="Show this route">${routeChip(t.decision, t.reply)}</button>
      <div class="bubble">${md(t.reply?.text || '')}</div></div>`;
  }).join('');
  log.scrollTop = log.scrollHeight;
}
$('#log').addEventListener('click', e => {
  const ex = e.target.closest('[data-ex]');
  if (ex) { $('#prompt').value = ex.dataset.ex; live(); $('#prompt').focus(); return; }
  const s = e.target.closest('[data-sel]');
  if (s) { state.selected = +s.dataset.sel; $('#prompt').value = ''; renderLog(); renderSheet(); }
});
$('#clear').addEventListener('click', () => { state.turns = []; state.selected = -1; renderLog(); renderSheet(); });

$('#prompt').addEventListener('keydown', e => {
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); $('#composer').requestSubmit(); }
});
let liveTimer;
$('#prompt').addEventListener('input', () => { clearTimeout(liveTimer); liveTimer = setTimeout(live, 120); });

function live() {
  const p = $('#prompt').value.trim();
  if (!p) { $('#livehint').textContent = ''; renderSheet(); return; }
  const d = localDecision(p, historyTokens());
  $('#livehint').innerHTML = `Live: <b>${esc(CATEGORIES[d.analysis.category].label)}</b> · effort ${d.analysis.effort} · impact ${d.analysis.impact} → <b>${esc(d.chosen.name)}</b>`;
  renderSheet(d, null, null, true);
}

function historyTokens() {
  return state.turns.filter(t => !t.pending).reduce((n, t) => n + Math.ceil(((t.role === 'user' ? t.content : t.reply?.text) || '').length / 4), 0);
}

$('#composer').addEventListener('submit', async e => {
  e.preventDefault();
  const prompt = $('#prompt').value.trim();
  if (!prompt) return;
  $('#send').disabled = true;
  const ctx = historyTokens();
  state.turns.push({ role: 'user', content: prompt });
  const messages = state.turns.filter(t => !t.pending).map(t => ({ role: t.role, content: t.role === 'user' ? t.content : (t.reply?.text || '') }));
  const pending = { role: 'assistant', pending: true };
  state.turns.push(pending);
  $('#prompt').value = ''; $('#livehint').textContent = '';
  renderLog();

  const { decision, reply, attempts } = await runTurn(prompt, messages, ctx);
  Object.assign(pending, { pending: false, decision, reply, attempts });
  state.selected = state.turns.indexOf(pending);
  $('#send').disabled = false;
  renderLog(); renderSheet();
});

// Routes and runs one turn: browser Ollama, the /api/chat function, or a simulated reply in preview.
export async function runTurn(prompt, messages, ctx, opts = {}) {
  const mode = opts.mode ?? state.mode;
  const override = 'override' in opts ? opts.override : overrideOpt();
  let decision, reply, attempts = [];
  try {
    const local = localDecision(prompt, ctx, { mode, override });
    if (state.local.on && local.executing?.runtime === 'ollama') {
      decision = local;
      reply = await runOllamaInBrowser(local, messages);
    } else if (state.api) {
      const r = await fetch('./api/chat', { method: 'POST', headers: headers(), body: JSON.stringify({ messages, mode, override, byo: state.byo }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`);
      ({ decision, reply, attempts } = j);
    } else {
      decision = local;
      reply = previewReply(local);
    }
  } catch (err) {
    decision = decision || localDecision(prompt, ctx, { mode, override });
    reply = { ...previewReply(decision), error: err.message, text: `That call failed: ${err.message}. Here is the route it would take.\n\n` + previewReply(decision).text };
  }
  return { decision, reply, attempts };
}

async function runOllamaInBrowser(d, messages) {
  const t0 = performance.now();
  const r = await fetch(`${state.local.url.replace(/\/$/, '')}/api/chat`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model: d.executing.model, stream: false, messages: [{ role: 'system', content: d.execution.systemPrompt }, ...messages] }),
  });
  if (!r.ok) throw new Error(`Ollama returned ${r.status}. Is "${d.executing.model}" pulled?`);
  const j = await r.json();
  return {
    text: j.message?.content || '', model: d.executing.id, modelName: d.executing.name, servedBy: `ollama:${d.executing.model}`,
    usage: { input: j.prompt_eval_count || 0, output: j.eval_count || 0 }, cost: 0, latencyMs: Math.round(performance.now() - t0), browserLocal: true,
  };
}

function previewReply(d) {
  return {
    demo: true, model: d.chosen.id, modelName: d.chosen.name, cost: 0, usage: { input: 0, output: 0 },
    text: `Simulated reply. Route would send this to **${d.chosen.name}** (${d.chosen.lab}, ${TIERS[d.tier].label} tier) in ${MODES[d.mode].label} mode.\n\n` + d.reasons.map(r => `- ${r}`).join('\n'),
  };
}

// ---------- route sheet ----------
function pips(n, cls) { return `<div class="pips ${cls}">${[1, 2, 3, 4, 5].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</div>`; }

function renderSheet(d, reply, attempts, isLive) {
  if (!d) {
    const t = state.turns[state.selected];
    if (t && t.decision) ({ decision: d, reply, attempts } = t);
  }
  let example = false;
  if (!d) { d = localDecision(EXAMPLES[0]); example = true; }
  const a = d.analysis;
  const ex = d.executing || d.chosen;
  const label = isLive ? 'Live preview' : example ? `Example route · “${EXAMPLES[0].slice(0, 44)}…”` : 'Routed to';
  const tierOf = id => (allModels().find(m => m.id === id) || {}).tier;

  const notes = [];
  if (d.override) {
    notes.push(`You picked ${esc(d.chosen.name)}. Route recommends ${esc(d.recommended.name)}.`);
    d.override.warnings.forEach(w => notes.push(esc(w)));
  }
  if (d.executingReason) notes.push(esc(d.executingReason));
  if (reply?.fellBack) notes.push(`${esc(d.executing.name)} failed, so ${esc(reply.modelName)} answered.`);
  (attempts || []).filter(x => !x.ok).forEach(x => notes.push(`${esc(x.model)} failed: ${esc(x.error)}`));

  const ranked = d.alternatives.filter(x => x.eligible);
  const excluded = d.alternatives.filter(x => !x.eligible);
  const ids = new Set(ranked.map(x => x.id));

  const lanes = Object.entries(TIERS).map(([t, info]) => {
    const stops = d.alternatives.filter(m => m.tier === t).sort((x, y) => x.estCost - y.estCost || x.name.localeCompare(y.name)).map(m => {
      const cls = ['stop', ids.has(m.id) ? 'elig' : 'out', m.id === (reply?.model || ex.id) ? 'pick' : '', m.id === d.recommended.id ? 'rec' : ''].join(' ');
      const tip = ids.has(m.id) ? `Score ${m.score} · ${money(m.estCost)}` : m.whyNot.join('; ');
      return `<button type="button" class="${cls}" data-use="${m.id}" title="${esc(tip)}">${esc(m.name)}</button>`;
    }).join('');
    return `<div class="lane"><div class="name"><span class="tierdot" style="background:${TIER_VAR[t]}"></span>${esc(info.label)}</div><div class="track">${stops}</div></div>`;
  }).join('');

  const shownCost = reply && !reply.demo ? reply.cost : d.cost.estimate;
  const saved = d.cost.baseline > 0 ? Math.round((1 - shownCost / d.cost.baseline) * 100) : 0;

  $('#sheet').innerHTML = `
  <div class="sec">
    <div class="eyebrow"><span>${esc(label)}</span><span class="badge mode">${esc(MODES[d.mode].label)} mode</span></div>
    <div class="picked">
      <div style="display:grid;gap:4px;min-width:0">
        <h2>${esc(reply?.modelName && !reply.demo ? reply.modelName : ex.name)}</h2>
        <div class="sub">${esc(ex.lab)} · <span class="mono">${esc(ex.model)}</span></div>
      </div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <span class="badge ${d.tier}">${esc(TIERS[tierOf(ex.id) || d.tier].label)}</span>
        ${d.override ? '<span class="badge warn">Your pick</span>' : ''}
        ${reply?.demo ? '<span class="badge mode">Simulated</span>' : ''}
        ${reply?.browserLocal ? '<span class="badge local">Ran in your browser</span>' : ''}
      </div>
    </div>
    ${notes.map(n => `<div class="note">${n}</div>`).join('')}
  </div>
  <div class="sec">
    <div class="dials">
      <div class="dial"><span class="l">Job type</span><span class="v">${esc(CATEGORIES[a.category].label)}</span>
        <div class="bar" title="Confidence"><i style="width:${Math.round(a.confidence * 100)}%"></i></div>
        <span class="s">${Math.round(a.confidence * 100)}% sure${a.secondary ? ` · also ${esc(CATEGORIES[a.secondary].label.toLowerCase())}` : ''}</span></div>
      <div class="dial"><span class="l">Effort</span><span class="v">${a.effort}/5 ${esc(EFFORT_LABELS[a.effort])}</span>${pips(a.effort, 'effort')}<span class="s">${esc(a.effortSignals[0])}</span></div>
      <div class="dial"><span class="l">Impact</span><span class="v">${a.impact}/5 ${esc(IMPACT_LABELS[a.impact])}</span>${pips(a.impact, 'impact')}<span class="s">${esc(a.impactSignals[0])}</span></div>
      <div class="dial"><span class="l">Quality bar</span><span class="v">${d.qualityBar}/10</span><div class="bar"><i style="width:${d.qualityBar * 10}%;background:var(--cobalt)"></i></div><span class="s">${esc(a.classifier === 'heuristic' ? 'Heuristic classifier' : a.classifier)}</span></div>
    </div>
  </div>
  <div class="sec">
    <div class="eyebrow"><span>Route map</span><span>cheapest → priciest · click to override</span></div>
    <div class="lanes">${lanes}</div>
  </div>
  <div class="sec">
    <div class="eyebrow"><span>Why this model</span></div>
    <ol class="why">${d.reasons.map(r => `<li>${esc(r)}</li>`).join('')}</ol>
  </div>
  <div class="sec">
    <div class="eyebrow"><span>${reply && !reply.demo ? 'Actual cost' : 'Estimated cost'}</span><span class="mono">${reply && !reply.demo ? `${reply.usage.input} in · ${reply.usage.output} out · ${reply.latencyMs} ms` : `~${d.tokens.input} in · ~${d.tokens.output} out`}</span></div>
    <div class="costrow"><span class="big">${money(shownCost)}</span>
      <span class="muted">vs ${money(d.cost.baseline)} on Claude Opus 5.5</span>
      ${saved > 0 ? `<span class="save">${saved}% saved</span>` : saved < 0 ? `<span class="muted">${-saved}% more for extra capability</span>` : ''}</div>
  </div>
  ${d.guardrails.length ? `<div class="sec"><div class="eyebrow"><span>Guardrails</span>${a.pii.found ? `<span class="badge warn">PII: ${esc(a.pii.kinds.join(', '))}</span>` : ''}</div><ul class="guard">${d.guardrails.map(g => `<li>${esc(g)}</li>`).join('')}</ul></div>` : ''}
  <div class="sec">
    <div class="eyebrow"><span>Fallback chain</span></div>
    <div class="chain"><span class="c"><b>${esc(ex.name)}</b></span>${d.fallbacks.map(id => `<span class="arrow">→</span><span class="c">${esc((allModels().find(m => m.id === id) || { name: id }).name)}</span>`).join('') || '<span class="muted">No connected fallback</span>'}</div>
  </div>
  <div class="sec">
    <div class="eyebrow"><span>Shortlist</span><span>${ranked.length} qualify · ${excluded.length} excluded</span></div>
    <div class="tablewrap"><table>
      <thead><tr><th>Model</th><th>Tier</th><th class="num">Fit</th><th class="num">Quality</th><th class="num">Est. cost</th><th class="num">Score</th><th></th></tr></thead>
      <tbody>${ranked.slice(0, 6).map(m => `<tr><td><b>${esc(m.name)}</b>${m.connected ? '' : ' <span class="muted">(not connected)</span>'}</td><td><span class="tierdot" style="background:${TIER_VAR[m.tier]}"></span> ${esc(TIERS[m.tier].label)}</td><td class="num">${m.fit}</td><td class="num">${m.quality}</td><td class="num">${money(m.estCost)}</td><td class="num">${m.score}</td><td><button type="button" class="use" data-use="${m.id}">Use</button></td></tr>`).join('')}</tbody>
    </table></div>
    <details><summary>Why the other ${excluded.length} were excluded</summary>
      <div class="tablewrap"><table><tbody>${excluded.map(m => `<tr><td>${esc(m.name)}</td><td class="muted">${esc(m.whyNot.join('; '))}</td></tr>`).join('')}</tbody></table></div>
    </details>
  </div>`;
}
$('#sheet').addEventListener('click', e => {
  const u = e.target.closest('[data-use]'); if (!u) return;
  state.override = u.dataset.use; $('#override').value = state.override;
  const p = $('#prompt').value.trim();
  if (!p) {
    const lastUser = [...state.turns].reverse().find(t => t.role === 'user');
    $('#prompt').value = lastUser ? lastUser.content : EXAMPLES[0];
  }
  live(); $('#prompt').focus();
});

// ---------- library ----------
function bestAt(m) {
  return Object.entries(m.fit).sort((x, y) => y[1] - x[1]).slice(0, 2).map(([k]) => CATEGORIES[k].label).join(', ');
}
function connectedLabel(m) {
  if (!state.api) return '<span class="muted">Preview</span>';
  const on = m.runtime === 'byo' || state.connected.has(m.runtime) || (m.runtime === 'ollama' && state.local.on);
  return `<span class="pill"><span class="dot ${on ? 'on' : ''}"></span>${on ? 'Connected' : 'Add key'}</span>`;
}

function renderLibrary() {
  const sections = Object.entries(TIERS).map(([t, info]) => {
    const models = allModels().filter(m => m.tier === t);
    const rows = models.map(m => `<tr>
      <td><b>${esc(m.name)}</b><div class="muted" style="font-size:12.5px">${esc(m.strengths)}</div></td>
      <td>${esc(m.lab)}</td><td class="mono">${esc(m.model)}</td>
      <td class="num">${ktok(m.ctx)}</td><td class="num">${m.price.in || m.price.out ? `${money(m.price.in)} / ${money(m.price.out)}` : 'Free'}</td>
      <td class="num">${m.quality}</td><td>${esc(bestAt(m))}</td><td>${connectedLabel(m)}${m.byo ? ` <button class="use" data-rm="${esc(m.id)}">Remove</button>` : ''}</td></tr>`).join('');
    let extra = '';
    if (t === 'slm') extra = `
      <div class="prose"><p><b>Bring your own model.</b> Any OpenAI-compatible endpoint works: your fine-tune on Hugging Face, Together, Groq, Fireworks or a self-hosted vLLM. The key stays in this browser and is sent only with your own requests.</p></div>
      <form class="form" id="byo-form">
        <label>Name<input id="byo-name" required placeholder="Acme Support 7B"></label>
        <label>Base URL<input id="byo-url" required placeholder="https://api.together.xyz/v1"></label>
        <label>Model id<input id="byo-model" required placeholder="acme/support-7b"></label>
        <label>API key<input id="byo-key" type="password" placeholder="optional"></label>
        <label>Best at<select id="byo-cat">${Object.entries(CATEGORIES).map(([k, c]) => `<option value="${k}">${esc(c.label)}</option>`).join('')}</select></label>
        <button class="btn" type="submit">Add model</button>
      </form>`;
    if (t === 'local') extra = `
      <div class="prose"><p><b>Run local models with Ollama.</b> Install Ollama, pull a model, and allow this site to reach it. Route then sends light, low-risk work to your machine for free, and nothing leaves it.</p></div>
      <pre class="code">ollama pull gemma3:12b && ollama pull qwen2.5-coder:7b
OLLAMA_ORIGINS="*" ollama serve</pre>
      <div class="form">
        <label class="toggle"><input type="checkbox" id="local-on" ${state.local.on ? 'checked' : ''}> Run local models from my browser</label>
        <label>Ollama URL<input id="local-url" value="${esc(state.local.url)}"></label>
      </div>`;
    return `<div class="panel">
      <div class="head"><h2><span class="tierdot" style="background:${TIER_VAR[t]};width:12px;height:12px"></span>${esc(info.label)}</h2><span class="muted">${esc(info.blurb)} · ${models.length} models</span></div>
      <div class="body"><div class="tablewrap"><table>
        <thead><tr><th>Model</th><th>Lab</th><th>API id</th><th class="num">Context</th><th class="num">$ / 1M in / out</th><th class="num">Quality</th><th>Best at</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody></table></div>${extra}</div></div>`;
  }).join('');
  $('#view-library').innerHTML = sections + `<p class="muted" style="font-size:12.5px;margin:0">Frontier prices from public pricing pages as of October 2026; SLM prices are typical Hugging Face provider rates. Edit <span class="mono">public/core/catalog.js</span> to change the lineup.</p>`;

  $('#byo-form')?.addEventListener('submit', e => {
    e.preventDefault();
    const cat = $('#byo-cat').value;
    const def = { name: $('#byo-name').value.trim(), baseURL: $('#byo-url').value.trim(), model: $('#byo-model').value.trim(), apiKey: $('#byo-key').value.trim() || undefined, fit: { [cat]: 8 } };
    def.id = byoToModel(def).id;
    state.byo = [...state.byo.filter(b => b.id !== def.id), def];
    store.set('byo', state.byo);
    renderLibrary(); renderOverride(); renderStatus();
  });
  $('#view-library').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => {
    state.byo = state.byo.filter(x => x.id !== b.dataset.rm); store.set('byo', state.byo);
    renderLibrary(); renderOverride();
  }));
  $('#local-on')?.addEventListener('change', e => { state.local.on = e.target.checked; store.set('local', state.local); renderStatus(); renderLibrary(); });
  $('#local-url')?.addEventListener('change', e => { state.local.url = e.target.value.trim(); store.set('local', state.local); });
}

// ---------- integrate ----------
function renderIntegrate() {
  const base = state.api ? location.origin : 'https://your-route.vercel.app';
  const sample = JSON.stringify((() => { const d = localDecision(EXAMPLES[0]); return { mode: d.mode, tier: d.tier, chosen: d.chosen, analysis: { category: d.analysis.category, effort: d.analysis.effort, impact: d.analysis.impact, confidence: d.analysis.confidence }, reasons: d.reasons.slice(0, 2), guardrails: d.guardrails, fallbacks: d.fallbacks, cost: d.cost }; })(), null, 2);
  $('#view-integrate').innerHTML = `
  <div class="grid2">
    <div class="panel"><div class="head"><h2>Ask for a route</h2><span class="mono">POST /api/route</span></div><div class="body">
      <div class="prose"><p>Returns the decision only. Use it when the main platform runs the model itself.</p></div>
      <pre class="code">curl -s ${esc(base)}/api/route \\
  -H 'content-type: application/json' \\
  -d '{"prompt":"Add Pine Labs refunds to checkout","mode":"auto"}'</pre>
      <pre class="code">${esc(sample)}</pre></div></div>
    <div class="panel"><div class="head"><h2>Route and run</h2><span class="mono">POST /api/chat</span></div><div class="body">
      <div class="prose"><p>Routes the last user message, calls the model, and walks the fallback chain if a provider fails.</p></div>
      <pre class="code">curl -s ${esc(base)}/api/chat \\
  -H 'content-type: application/json' \\
  -d '{"messages":[{"role":"user","content":"Rename these to camelCase: user_id, created_at"}],
       "mode":"saver",
       "override":{"tier":"local"}}'</pre>
      <div class="prose"><p>Other endpoints: <span class="mono">GET /api/catalog</span> lists models and connected providers. <span class="mono">GET /api/health</span> for uptime checks.</p></div></div></div>
    <div class="panel"><div class="head"><h2>Use the engine in code</h2><span class="mono">public/core/router.js</span></div><div class="body">
      <div class="prose"><p>The router is a pure function with no dependencies, so the platform can import it directly and skip the network hop.</p></div>
      <pre class="code">import { route } from './core/router.js';

const decision = route(
  { prompt, contextTokens },
  { mode: 'auto', available: ['anthropic', 'hf'], override: { model: 'claude-sonnet-5-5' } }
);
decision.chosen.model;    // API model id to call
decision.reasons;         // plain-English explanation
decision.fallbacks;       // next models if the call fails</pre></div></div>
    <div class="panel"><div class="head"><h2>Environment</h2><span class="mono">.env.example</span></div><div class="body">
      <div class="tablewrap"><table><tbody>
        <tr><td class="mono">ANTHROPIC_API_KEY</td><td>Claude Fable, Opus, Sonnet, Haiku</td></tr>
        <tr><td class="mono">OPENAI_API_KEY</td><td>GPT-6 Astra, 6.1 Sol, 5.3 Codex, 6 Luna</td></tr>
        <tr><td class="mono">GEMINI_API_KEY</td><td>Gemini 3.1 Pro, 3.7 Flash, 3.1 Flash-Lite</td></tr>
        <tr><td class="mono">HF_TOKEN</td><td>SLM library via Hugging Face Inference Providers</td></tr>
        <tr><td class="mono">OLLAMA_BASE_URL</td><td>Local models through a tunnel (or use the browser switch)</td></tr>
        <tr><td class="mono">BYO_MODELS</td><td>JSON list of your own OpenAI-compatible models</td></tr>
        <tr><td class="mono">ROUTER_CLASSIFIER</td><td><span class="mono">heuristic</span> or <span class="mono">llm</span> (Claude Haiku 5.5)</td></tr>
        <tr><td class="mono">ROUTER_API_SECRET</td><td>Require an <span class="mono">x-provn-key</span> header</td></tr>
      </tbody></table></div>
      <form class="form" id="secret-form"><label>Access key for this console<input id="secret" type="password" value="${esc(state.secret)}" placeholder="Only if ROUTER_API_SECRET is set"></label><button class="btn ghost" type="submit">Save</button></form>
    </div></div>
  </div>`;
  $('#secret-form').addEventListener('submit', e => { e.preventDefault(); state.secret = $('#secret').value.trim(); store.set('secret', state.secret); boot(); });
}

// ---------- tabs ----------
function show(view) {
  state.view = view;
  document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.view === view)));
  $('#view-console').hidden = view !== 'console';
  $('#view-library').hidden = view !== 'library';
  $('#view-integrate').hidden = view !== 'integrate';
}
document.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-view]'); if (b) show(b.dataset.view); });

export const ready = boot();
