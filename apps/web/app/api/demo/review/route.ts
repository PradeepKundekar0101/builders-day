import { z } from "zod";
import { badRequest } from "@/lib/demo/api";
import { securityReview } from "@/lib/demo/agenticorg";
import { planFromIdea } from "@/lib/demo/plan";

const Body = z.object({
  idea: z.string().trim().min(20).max(2000),
  name: z.string().trim().min(1).max(80).optional(),
});

// Real call to the AgenticOrg "PROVN Security Reviewer" agent; review is null when unavailable.
export async function POST(request: Request) {
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest();
  const plan = planFromIdea(parsed.data.idea);
  const review = await securityReview(
    parsed.data.name ? { ...plan, name: parsed.data.name } : plan,
  );
  return Response.json({ review }, { headers: { "cache-control": "no-store" } });
}
