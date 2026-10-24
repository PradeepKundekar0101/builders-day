import { AttackBody, badRequest, simulateLatency } from "@/lib/demo/api";
import { runAttack } from "@/lib/demo/attack";
import { planFromIdea } from "@/lib/demo/plan";

// Mock: no traffic is sent anywhere; results are computed from the plan.
export async function POST(request: Request) {
  const parsed = AttackBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return badRequest();
  await simulateLatency(600);
  const plan = planFromIdea(parsed.data.idea);
  return Response.json(runAttack(plan, parsed.data.hardened), {
    headers: { "cache-control": "no-store" },
  });
}
