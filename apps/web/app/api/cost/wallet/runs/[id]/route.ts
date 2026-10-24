import { z } from "zod";
import { creditsToUnits } from "@buildwise/cost-guard";
import { costIdentity, costService, costError, requireSameOrigin } from "@/lib/cost/server";
import { quoteFromReviewedStudio } from "@/lib/prompt-studio/build-origin";
const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    decisionId: z.string().uuid(),
    capCredits: z.number().positive(),
  }),
  z.object({ action: z.literal("start"), decisionId: z.string().uuid() }),
  z.object({
    action: z.literal("resume"),
    decisionId: z.string().uuid(),
    extraAttempts: z.number().int().min(1).max(3),
  }),
]);
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { userId } = await costIdentity();
    const runId = z
        .string()
        .uuid()
        .parse((await context.params).id),
      input = Input.parse(await request.json()),
      { wallet } = costService();
    if (!(await wallet.status(userId)).runs.some((r) => r.id === runId))
      throw new Error("NOT_FOUND");
    if (input.action === "start") {
      if (process.env.PROVN_LIVE_BUILDS !== "true") throw new Error("Live builds disabled");
      const { db } = costService();
      if (!(await quoteFromReviewedStudio(db, runId, userId)))
        return Response.json(
          { error: "Build must originate from a reviewed Prompt Studio version." },
          { status: 409 },
        );
      const { data: workers, error } = await db
        .from("build_worker_health")
        .select("id")
        .gt("seen_at", new Date(Date.now() - 60000).toISOString())
        .limit(1);
      if (error || !workers?.length)
        return Response.json(
          { error: "No build worker is available. Your credits have not been reserved." },
          { status: 503 },
        );
    }
    const base = { id: input.decisionId, runId };
    const command =
      input.action === "approve"
        ? {
            ...base,
            type: "approve" as const,
            capUnits: creditsToUnits(input.capCredits),
            actorId: userId,
          }
        : input.action === "resume"
          ? {
              ...base,
              type: "resume" as const,
              extraAttempts: input.extraAttempts,
              actorId: userId,
            }
          : { ...base, type: "start" as const };
    return Response.json(await wallet.execute(userId, command));
  } catch (error) {
    return costError(error);
  }
}
