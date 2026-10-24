// Reads provider credentials from the environment. Nothing here is ever sent to the browser
// except the list of connected runtimes.
import { RUNTIMES } from "../public/core/catalog.js";

export function connectedRuntimes() {
  return Object.entries(RUNTIMES)
    .filter(([, r]) => r.env && process.env[r.env])
    .map(([id]) => id);
}

export function byoFromEnv() {
  try {
    const list = JSON.parse(process.env.BYO_MODELS || "[]");
    return Array.isArray(list) ? list.filter((d) => d.baseURL && d.model) : [];
  } catch {
    return [];
  }
}

export const settings = () => ({
  classifier: process.env.ROUTER_CLASSIFIER === "llm" ? "llm" : "heuristic",
  defaultMode: process.env.ROUTER_DEFAULT_MODE || "auto",
});
