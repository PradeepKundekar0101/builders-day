import { NextResponse } from "next/server";
import { intakeService } from "@/lib/server/intake/instance";
import { userRoute } from "@/lib/server/routes";

export const GET = userRoute<{ id: string }>(async (_request, user, { id }) => {
  const view = await intakeService().ideaView(user.id, id);
  return NextResponse.json(view, { headers: { "cache-control": "private, no-store" } });
});
