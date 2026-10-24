import type { Spec } from "@buildwise/shared";
export const specRevision = "booking-demo:1";
export const fixture: Spec = {
  name: "Studio bookings",
  summary: "A small appointment booking application.",
  pages: [
    { name: "Home", purpose: "Introduce the studio", mustHave: true },
    { name: "About", purpose: "Tell the studio story", mustHave: false },
  ],
  entities: ["services", "appointments", "customers"].map((name) => ({
    name,
    fields: [{ name: "name", type: "text", required: true }],
    ownerScoped: true,
    mustHave: true,
  })),
  auth: { enabled: true, providers: ["email", "google"] },
  integrations: [
    { kind: "payment_pinelabs", mustHave: true },
    { kind: "email", mustHave: false },
    { kind: "admin_dashboard", mustHave: false },
  ],
};
