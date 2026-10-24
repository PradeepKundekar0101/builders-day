import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { userRoute } from "@/lib/server/routes";

const Body = z.object({ decision: z.enum(["approved", "rejected"]) });

export const POST = userRoute<{ id: string }>(
  async (request, user, { id }) => {
    const { decision } = Body.parse(await request.json());
    await intakeService().decide(user.id, id, decision);
    return NextResponse.json({ ok: true });
  },
  { staffOnly: true },
);
