import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { agentRoute } from "@/lib/server/routes";

const Body = z.object({ spec: z.unknown() });

export const POST = agentRoute<{ id: string }>(async (request, { id }) => {
  const { spec } = Body.parse(await request.json());
  const { quote, flagReasons } = await intakeService().submitSpec(id, spec);
  return NextResponse.json(
    { costUsd: quote.costUsd, flagged: flagReasons.length > 0 },
    { status: 201 },
  );
});
