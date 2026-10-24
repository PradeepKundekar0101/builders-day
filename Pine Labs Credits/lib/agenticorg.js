// Minimal AgenticOrg client (Pine Labs hackathon agent platform). Server-side only: the key never reaches the browser.
// Run contract: POST /api/v1/agents/{uuid}/run {action:"process", inputs, context} -> {status, confidence, output}.

export const RUN_STATUSES = ["completed", "failed", "hitl_triggered", "budget_exceeded"];

const pickList = (b) => (Array.isArray(b) ? b : b?.items || b?.agents || b?.data || b?.results || []);

export function normalizeAgent(a) {
  return {
    id: a.id || a.uuid || a.agent_id,
    name: a.name || a.display_name || a.agent_type || a.type || "Agent",
    type: a.agent_type || a.type || "",
    status: a.status || "",
    description: a.description || a.summary || "",
  };
}

export function createAgenticOrgClient({ baseUrl, apiKey, fetchImpl = fetch, timeoutMs = 120_000 }) {
  async function call(path, init = {}) {
    const res = await fetchImpl(baseUrl + path, {
      ...init,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", Accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      body = { raw: text.slice(0, 500) };
    }
    if (!res.ok) {
      const msg = body?.detail?.message || body?.detail || body?.message || body?.error || body?.raw || res.statusText;
      throw Object.assign(new Error(`AgenticOrg ${init.method || "GET"} ${path} -> ${res.status}: ${typeof msg === "string" ? msg : JSON.stringify(msg)}`), { status: res.status, upstream: true });
    }
    return body;
  }
  return {
    listAgents: async () => pickList(await call("/api/v1/agents")).map(normalizeAgent).filter((a) => a.id),
    runAgent: (id, inputs, context = {}) =>
      call(`/api/v1/agents/${encodeURIComponent(id)}/run`, { method: "POST", body: JSON.stringify({ action: "process", inputs, context }) }),
  };
}

/** Offline stand-in so the console works in mock mode or before a key is set. */
export function createMockAgenticOrgClient() {
  const agents = [
    { id: "00000000-0000-4000-8000-000000000001", name: "Demo research agent", type: "chat", status: "active", description: "Mock agent: echoes a short summary of the task." },
  ];
  return {
    listAgents: async () => agents,
    runAgent: async (id, inputs) => ({
      status: "completed",
      confidence: 0.9,
      output: { summary: `Mock run of ${id.slice(-4)}: "${String(inputs.task || "").slice(0, 120)}"` },
    }),
  };
}
