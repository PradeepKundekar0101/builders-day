import { z } from "zod";
import { userRoute } from "@/lib/server/routes";
import { costService } from "@/lib/cost/server";
export const POST = userRoute<{ id: string }>(
  async (request, user, { id }) => {
    const input = z
      .object({
        approve: z.boolean(),
        receiptVerified: z.boolean(),
        reference: z
          .string()
          .trim()
          .regex(/^\d{12}$/)
          .optional(),
      })
      .parse(await request.json());
    if (input.approve && (!input.receiptVerified || !input.reference))
      return Response.json(
        { error: "Verify receipt in your bank or UPI app first." },
        { status: 400 },
      );
    const { data, error } = await costService().db.rpc("review_manual_credit_payment", {
      p_id: id,
      p_actor: user.id,
      p_approve: input.approve,
      p_reference: input.reference ?? null,
    });
    if (error) throw error;
    return Response.json({ status: data });
  },
  { staffOnly: true },
);
