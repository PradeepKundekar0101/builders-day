import { z } from "zod";
import { saveStudio, studioError, studioUser, studioDb } from "@/lib/prompt-studio/server";
import { StudioHttpError } from "@/lib/prompt-studio/request";
export async function GET(
  _request: Request,
  context: RouteContext<"/api/prompt-studio/sessions/[id]">,
) {
  try {
    const userId = await studioUser();
    const { id } = await context.params;
    z.uuid().parse(id);
    const db = studioDb();
    const session = await db
      .from("prompt_studio_sessions")
      .select("id, revision")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (session.error) throw new StudioHttpError(503, "Draft storage is unavailable.");
    if (!session.data) throw new StudioHttpError(404, "Draft not found.");
    const versions = await db
      .from("prompt_studio_versions")
      .select("revision, payload, status, created_at")
      .eq("session_id", id)
      .order("revision", { ascending: false })
      .limit(20);
    if (versions.error) throw new StudioHttpError(503, "Draft history is unavailable.");
    const latest = versions.data?.[0];
    if (!latest) throw new StudioHttpError(404, "Draft not found.");
    return Response.json(
      {
        id,
        revision: latest.revision,
        draft: latest.payload,
        status: latest.status,
        history: versions.data,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return studioError(error);
  }
}
export async function PUT(
  request: Request,
  context: RouteContext<"/api/prompt-studio/sessions/[id]">,
) {
  try {
    const { id } = await context.params;
    z.uuid().parse(id);
    return await saveStudio(request, id);
  } catch (error) {
    return studioError(error);
  }
}
