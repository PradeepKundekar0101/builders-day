import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { userRoute } from "@/lib/server/routes";

const Body = z.object({ answer: z.string().trim().min(1).max(1000) });

export const POST = userRoute<{ id: string }>(async (request, user, { id }) => {
  const { answer } = Body.parse(await request.json());
  const message = await intakeService().answer(user.id, id, answer);
  return NextResponse.json({ id: message.id }, { status: 201 });
});
