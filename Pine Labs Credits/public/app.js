// Console UI: talks only to this server's /api, never to Pine Labs directly.
const $ = (s) => document.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const money = (minor, cur) => new Intl.NumberFormat("en-IN", { style: "currency", currency: cur }).format(minor / 100);
const usd = (n) => "$" + Number(n).toFixed(2);
const int = (n) => Number(n).toLocaleString("en-US");
const when = (iso) => (iso ? new Date(iso).toLocaleString([], { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "–");

let state = null, view = "links", selected = null;
let token = "";
try { token = localStorage.getItem("provn-admin-token") || ""; } catch {}

async function api(path, opts = {}) {
  const res = await fetch(path, { ...opts, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) } });
  if (res.status === 401) {
    token = prompt("Admin token (ADMIN_TOKEN in .env)") || "";
    try { localStorage.setItem("provn-admin-token", token); } catch {}
    if (token) return api(path, opts);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || res.statusText);
  return body;
}

function pill(link) {
  if (link.problem) return `<span class="pill problem" title="${esc(link.problem)}">CHECK</span>`;
  const s = link.status;
  const cls = link.grantedAt ? "paid" : ["CREATED", "CLICKED", "PAYMENT_INITIATED", "ACTIVE"].includes(s) ? "open" : "dead";
  return `<span class="pill ${cls}">${esc(link.grantedAt ? "PAID" : s)}</span>`;
}

function renderQuote() {
  if (!state) return;
  const p = state.pricing, v = Number($("#f").usd.value);
  if (!(v >= p.minTopupUsd)) return ($("#quote").innerHTML = `<div class="small">Minimum top-up is ${usd(p.minTopupUsd)}</div>`);
  const credits = Math.round(v * p.creditsPerUsd);
  const charge = p.chargeCurrency === "USD" ? Math.round(v * 100) : Math.round(v * 100 * p.usdToInr);
  $("#quote").innerHTML = `<div class="big"><span>${int(credits)}</span> credits</div>
    <div class="small">Payer is charged ${money(charge, p.chargeCurrency)}${p.chargeCurrency === "USD" ? "" : ` at $1 = ₹${p.usdToInr}`}</div>`;
}

function render() {
  const s = state;
  $("#mode").textContent = s.mode === "live" ? "LIVE · REAL MONEY" : s.mode === "uat" ? "PINE LABS UAT" : "MOCK CHECKOUT";
  $("#mode").className = "mode " + s.mode;
  $("#s-users").textContent = `${s.totals.payingUsers} / ${s.totals.users}`;
  $("#s-paid").textContent = usd(s.totals.paidUsd);
  $("#s-credits").textContent = int(s.totals.creditsGranted);
  $("#s-open").textContent = s.totals.openLinks;
  if (!$("#chips").children.length)
    $("#chips").innerHTML = [1, 5, 10, 25, 50].map((n) => `<button type="button" class="chip" data-usd="${n}">$${n} · ${int(n * s.pricing.creditsPerUsd)}</button>`).join("");
  renderQuote();

  $("#users").innerHTML = s.users.length
    ? s.users.map((u) => `<tr class="user ${selected === u.email ? "sel" : ""}" data-email="${esc(u.email)}">
        <td class="who"><b>${esc(u.name || u.email.split("@")[0])}</b><small>${esc(u.email)}</small></td>
        <td class="num">${usd(u.paidUsd)}<br><small class="mono">${u.paidLinks} paid${u.openLinks ? ` · ${u.openLinks} open` : ""}</small></td>
        <td class="num">${Object.entries(u.chargedByCurrency).map(([c, m]) => money(m, c)).join("<br>") || "–"}</td>
        <td class="num">${int(u.creditsGranted)}</td>
        <td class="num">${int(u.creditsSpent)}</td>
        <td class="num bal">${int(u.balance)}</td>
        <td>${when(u.lastPaidAt)}</td></tr>`).join("")
    : `<tr><td colspan="7" class="empty">No users yet. Create a payment link to add one.</td></tr>`;

  $("#clear").hidden = !selected;
  $("#links-title").textContent = selected ? `Activity · ${selected}` : view === "links" ? "Payment links" : view === "ledger" ? "Credit ledger" : "Webhook log";
  const mine = (x) => !selected || x.email === selected;
  let html;
  if (view === "links") {
    const rows = s.links.filter(mine);
    html = rows.length ? `<table><thead><tr><th>Created</th><th>User</th><th class="num">Top-up</th><th class="num">Charged</th><th>Status</th><th></th></tr></thead><tbody>${rows.map((l) => `<tr>
      <td>${when(l.createdAt)}<br><small class="mono">${esc(l.id)}</small></td>
      <td>${esc(l.email)}</td>
      <td class="num">${usd(l.usd)}<br><small class="mono">${int(l.credits)} cr</small></td>
      <td class="num">${money(l.charge.minor, l.charge.currency)}</td>
      <td>${pill(l)}${l.grantedAt ? `<br><small class="mono">granted ${when(l.grantedAt)}</small>` : ""}</td>
      <td class="num act"><a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">Open</a>
        <button class="btn" data-copy="${esc(l.url)}">Copy</button>
        <button class="btn" data-sync="${esc(l.id)}">Check</button></td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No payment links yet.</div>`;
  } else if (view === "ledger") {
    const rows = s.ledger.filter(mine);
    html = rows.length ? `<table><thead><tr><th>When</th><th>User</th><th>Entry</th><th class="num">Credits</th><th>Source</th></tr></thead><tbody>${rows.map((e) => `<tr>
      <td>${when(e.at)}</td><td>${esc(e.email)}</td>
      <td>${e.type === "grant" ? `Top-up ${usd(e.usd)}` : esc(e.reason)}<br><small class="mono">${esc(e.linkId || e.id)}</small></td>
      <td class="num bal" style="color:${e.type === "grant" ? "var(--ok)" : "var(--bad)"}">${e.type === "grant" ? "+" : "−"}${int(e.credits)}</td>
      <td class="mono">${esc(e.source || "api")}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No credits granted yet.</div>`;
  } else {
    html = s.webhooks.length ? `<table><thead><tr><th>Received</th><th>Event</th><th>Link</th><th>Signature</th></tr></thead><tbody>${s.webhooks.map((w) => `<tr>
      <td>${when(w.at)}</td><td class="mono">${esc(w.event)}</td><td class="mono">${esc(w.paymentLinkId || w.reference || "–")}</td>
      <td>${w.verified ? `<span class="pill paid">VERIFIED</span>` : `<span class="pill problem" title="${esc(w.reason)}">REJECTED</span>`}</td></tr>`).join("")}</tbody></table>`
      : `<div class="empty">No webhooks received. That's fine locally: open links are rechecked every 20 seconds.</div>`;
  }
  $("#panel").innerHTML = html;
}

async function refresh() {
  try { state = await api("/api/summary"); render(); } catch (e) { $("#err").textContent = e.message; }
}

$("#f").addEventListener("input", renderQuote);
$("#chips").addEventListener("click", (e) => {
  const b = e.target.closest("[data-usd]");
  if (b) { $("#f").usd.value = b.dataset.usd; renderQuote(); }
});
$("#f").addEventListener("submit", async (e) => {
  e.preventDefault();
  const f = e.target, go = $("#go");
  $("#err").textContent = ""; go.disabled = true; go.textContent = "Creating…";
  try {
    const link = await api("/api/topups", { method: "POST", body: JSON.stringify({ email: f.email.value, name: f.name.value, phone: f.phone.value, usd: Number(f.usd.value) }) });
    $("#result").className = "result show";
    $("#result").innerHTML = `<b>Link ready for ${esc(link.email)}</b> · ${int(link.credits)} credits for ${money(link.charge.minor, link.charge.currency)}
      <div class="url">${esc(link.url)}</div>
      <a class="btn" href="${esc(link.url)}" target="_blank" rel="noopener">Open checkout</a> <button class="btn" data-copy="${esc(link.url)}">Copy link</button>`;
    selected = link.email; view = "links";
    await refresh();
  } catch (err) { $("#err").textContent = err.message; }
  go.disabled = false; go.textContent = "Create payment link";
});
document.addEventListener("click", async (e) => {
  const t = e.target;
  if (t.dataset.copy) { navigator.clipboard.writeText(t.dataset.copy); t.textContent = "Copied"; setTimeout(() => (t.textContent = "Copy"), 1200); }
  if (t.dataset.sync) { t.textContent = "…"; try { await api(`/api/links/${encodeURIComponent(t.dataset.sync)}/sync`, { method: "POST" }); } catch (err) { alert(err.message); } refresh(); }
  const row = t.closest("tr.user");
  if (row) { selected = selected === row.dataset.email ? null : row.dataset.email; render(); }
  const tab = t.closest(".tab");
  if (tab) { view = tab.dataset.v; document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === tab)); render(); }
});
$("#clear").addEventListener("click", () => { selected = null; render(); });
$("#recheck").addEventListener("click", async () => { $("#recheck").textContent = "Checking…"; await api("/api/reconcile", { method: "POST" }).catch((e) => alert(e.message)); $("#recheck").textContent = "Recheck open"; refresh(); });

refresh();
setInterval(refresh, 5000);
