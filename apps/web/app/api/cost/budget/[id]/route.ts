import { z } from "zod";
import { costIdentity, costService, costError, requireSameOrigin } from "@/lib/cost/server";
const Input = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("approve"),
    decisionId: z.string().uuid(),
    newCapMicros: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  }),
  z.object({ action: z.literal("stop"), decisionId: z.string().uuid() }),
]);
async function owned(id: string) {
  z.string().uuid().parse(id);
  const { db, userId } = await costIdentity();
  const { data, error } = await db
    .from("builds")
    .select("id")
    .eq("id", id)
    .eq("user_id", userId)
    .single();
  if (error || !data) throw new Error("NOT_FOUND");
  return { userId, guard: costService().guard };
}
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const { guard } = await owned(id);
    return Response.json(await guard.status(id));
  } catch (error) {
    return costError(error);
  }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    requireSameOrigin(request);
    const { id } = await context.params;
    const { userId, guard } = await owned(id);
    const input = Input.parse(await request.json());
    const command =
      input.action === "approve"
        ? {
            type: "approve" as const,
            id: input.decisionId,
            actorId: userId,
            newCapMicros: input.newCapMicros,
          }
        : { type: "stop" as const, id: input.decisionId };
    return Response.json(await guard.execute(id, command));
  } catch (error) {
    return costError(error);
  }
}
