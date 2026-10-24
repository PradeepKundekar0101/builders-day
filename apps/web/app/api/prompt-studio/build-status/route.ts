import { studioUser, studioError } from "@/lib/prompt-studio/server";
import { costService } from "@/lib/cost/server";
import { StudioHttpError } from "@/lib/prompt-studio/request";
export async function GET() {
  try {
    const userId = await studioUser(),
      { db } = costService();
    const { data: builds, error } = await db
      .from("builds")
      .select("id,status,created_at,quote_id")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new StudioHttpError(503, "Build history is unavailable.");
    const items = [];
    for (const build of builds ?? []) {
      const { data: quote } = await db
        .from("quotes")
        .select("spec_id")
        .eq("id", build.quote_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!quote) continue;
      const { data: mapping } = await db
        .from("studio_build_specs")
        .select("session_id,revision")
        .eq("spec_id", quote.spec_id)
        .maybeSingle();
      if (!mapping) continue;
      const { data: output } = await db
        .from("build_outputs")
        .select("status")
        .eq("build_id", build.id)
        .maybeSingle();
      items.push({
        id: build.id,
        status: output?.status ?? build.status,
        createdAt: build.created_at,
        sessionId: mapping.session_id,
        revision: mapping.revision,
      });
    }
    return Response.json({ builds: items }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return studioError(e);
  }
}
