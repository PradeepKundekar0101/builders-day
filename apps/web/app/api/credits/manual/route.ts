import { z } from "zod";
import { buildContextSchema } from "@/lib/payments/build-context";
import { costIdentity, costService, requireSameOrigin } from "@/lib/cost/server";
import { paymentError } from "@/lib/payments/errors";
export async function GET() {
  try {
    const { userId } = await costIdentity();
    const { db, wallet } = costService();
    const { data, error } = await db
      .from("manual_credit_payments")
      .select("id,credits,reference,status,created_at,build_session,build_revision")
      .eq("account_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw error;
    return Response.json(
      { purchases: data, wallet: await wallet.status(userId) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return paymentError(e);
  }
}
export async function POST(request: Request) {
  try {
    requireSameOrigin(request);
    const { userId } = await costIdentity();
    const input = z
      .object({
        id: z.string().uuid(),
        credits: z.number().int().min(100).max(10000),
        buildContext: buildContextSchema.optional(),
      })
      .parse(await request.json());
    const { db } = costService();
    if (input.buildContext) {
      const { data: session, error } = await db
        .from("prompt_studio_sessions")
        .select("revision")
        .eq("id", input.buildContext.session)
        .eq("user_id", userId)
        .maybeSingle();
      if (error || !session || session.revision !== input.buildContext.revision)
        return Response.json(
          {
            error:
              "Your saved build changed or is unavailable. Return to the estimate before paying.",
          },
          { status: 409 },
        );
    }
    const { buildContext, ...purchase } = input;
    const { error } = await db
      .from("manual_credit_payments")
      .insert({
        ...purchase,
        account_id: userId,
        ...(buildContext
          ? { build_session: buildContext.session, build_revision: buildContext.revision }
          : {}),
      });
    if (error?.code === "23505")
      return Response.json(
        {
          error: "A payment is already pending. Refresh to continue your existing payment.",
        },
        { status: 409 },
      );
    if (error) throw error;
    return Response.json({ status: "pending", id: input.id });
  } catch (e) {
    return paymentError(e);
  }
}
