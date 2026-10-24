import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { agentRoute } from "@/lib/server/routes";

export const GET = agentRoute<{ id: string }>(async (request, { id }) => {
  const after = z.uuid().parse(new URL(request.url).searchParams.get("after"));
  return NextResponse.json({ answers: await intakeService().answersAfter(id, after) });
});
