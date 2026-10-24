import { NextResponse } from "next/server";
import { z } from "zod";
import { intakeService } from "@/lib/server/intake/instance";
import { userRoute } from "@/lib/server/routes";

const Body = z.object({
  text: z.string(),
  links: z.array(z.url().max(500)).max(5).default([]),
});

export const POST = userRoute(async (request, user) => {
  const { text, links } = Body.parse(await request.json());
  const idea = await intakeService().submitIdea(user.id, text, links);
  return NextResponse.json({ id: idea.id }, { status: 201 });
});
