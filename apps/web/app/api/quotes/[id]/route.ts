import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { SelectionSchema } from "@/lib/server/intake/service";
import { userRoute } from "@/lib/server/routes";

const Body = z.object({ selection: SelectionSchema });

export const PATCH = userRoute<{ id: string }>(async (request, user, { id }) => {
  const { selection } = Body.parse(await request.json());
  const quote = await intakeService().updateSelection(user.id, id, selection);
  return NextResponse.json({
    costUsd: quote.costUsd,
    lowUsd: quote.lowUsd,
    highUsd: quote.highUsd,
    hours: quote.hours,
  });
});
