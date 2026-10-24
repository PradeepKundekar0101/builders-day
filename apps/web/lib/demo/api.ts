import { z } from "zod";

export const IdeaBody = z.object({ idea: z.string().trim().min(20).max(2000) });
export const AttackBody = IdeaBody.extend({ hardened: z.boolean().default(false) });

/** Mock endpoints pause like a real service would, so the demo shows its loading states. */
export const simulateLatency = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function badRequest() {
  return Response.json(
    { error: "Describe your idea in 20 to 2,000 characters." },
    { status: 400, headers: { "cache-control": "no-store" } },
  );
}
