import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { agentRoute } from "@/lib/server/routes";

const Body = z.object({ question: z.string().trim().min(5).max(500) });

export const POST = agentRoute<{ id: string }>(async (request, { id }) => {
  const { question } = Body.parse(await request.json());
  const message = await intakeService().askQuestion(id, question);
  return NextResponse.json({ id: message.id }, { status: 201 });
});
