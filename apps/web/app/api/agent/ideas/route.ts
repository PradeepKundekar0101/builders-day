import { NextResponse } from "next/server";
import { intakeService } from "@/lib/server/intake/instance";
import { agentRoute } from "@/lib/server/routes";

export const GET = agentRoute(async () => {
  return NextResponse.json({ ideas: await intakeService().listSubmittedIdeas() });
});
