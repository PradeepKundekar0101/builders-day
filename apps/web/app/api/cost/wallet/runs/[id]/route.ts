import { z } from "zod";
import { creditsToUnits } from "@buildwise/cost-guard";
import { costIdentity, costService, costError, requireSameOrigin } from "@/lib/cost/server";
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
