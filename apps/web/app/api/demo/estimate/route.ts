import { badRequest, IdeaBody, simulateLatency } from "@/lib/demo/api";
import { planFromIdea } from "@/lib/demo/plan";

// Mock: no model call and nothing stored.
export async function POST(request: Request) {
  const parsed = IdeaBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest();
  await simulateLatency(900);
  return Response.json(planFromIdea(parsed.data.idea), {
    headers: { "cache-control": "no-store" },
  });
}
