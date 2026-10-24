import { z } from "zod";
import { costIdentity, costService, costError, requireSameOrigin } from "@/lib/cost/server";
export async function GET() {
  try {
    const { userId } = await costIdentity();
    return Response.json(await costService().wallet.status(userId));
  } catch (error) {
    return costError(error);
  }
}
/** Applies to future quotes; existing locked approvals retain their original requirement. */
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { userId } = await costIdentity();
    const input = z
      .object({
        decisionId: z.string().uuid(),
        thresholdCredits: z.number().finite().nonnegative().max(900_000_000),
      })
      .parse(await request.json());
    return Response.json(
      await costService().wallet.execute(userId, {
        type: "threshold",
        id: input.decisionId,
        credits: input.thresholdCredits,
      }),
    );
  } catch (error) {
    return costError(error);
  }
}
