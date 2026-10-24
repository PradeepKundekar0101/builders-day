import { z } from "zod";
import { studioDb, studioError, studioUser } from "@/lib/prompt-studio/server";
import { StudioHttpError } from "@/lib/prompt-studio/request";
import { BuildFeedQuery, buildFeedEvents, previewOrigins } from "@/lib/prompt-studio/build-feed";
import { publicEnv } from "@/lib/public-env";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await studioUser();
    const id = z.uuid().parse((await context.params).id);
    const q = BuildFeedQuery.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = studioDb();
    const build = await db
      .from("builds")
      .select("id, quote_id, status, budget_usd, spent_usd")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (build.error) throw new StudioHttpError(503, "Build storage is unavailable.");
    if (!build.data) throw new StudioHttpError(404, "Build not found.");
    const quote = await db
      .from("quotes")
      .select("spec_id")
      .eq("id", build.data.quote_id)
      .eq("user_id", userId)
      .maybeSingle();
    if (quote.error) throw new StudioHttpError(503, "Build scope is unavailable.");
    if (!quote.data) throw new StudioHttpError(404, "Build not found.");
    const spec = await db
      .from("specs")
      .select("idea_id")
      .eq("id", quote.data.spec_id)
      .eq("user_id", userId)
      .maybeSingle();
    const session = await db
      .from("prompt_studio_sessions")
      .select("id")
      .eq("id", q.session)
      .eq("user_id", userId)
      .maybeSingle();
    if (spec.error || session.error) throw new StudioHttpError(503, "Build scope is unavailable.");
    if (!session.data || spec.data?.idea_id !== q.session)
      throw new StudioHttpError(404, "Build not found for this draft.");
    const events = await db
      .from("build_events")
      .select("id, type, payload")
      .eq("build_id", id)
      .eq("type", "studio")
      .gt("id", q.after)
      .order("id", { ascending: true })
      .limit(200);
    if (events.error) throw new StudioHttpError(503, "Build events are unavailable.");
    const rows = events.data ?? [];
    return Response.json(
      {
        runId: id,
        status: build.data.status,
        budgetUsd: build.data.budget_usd,
        spentUsd: build.data.spent_usd,
        cursor: rows.at(-1)?.id ?? q.after,
        events: buildFeedEvents(rows, id, q.stage),
        allowedPreviewOrigins: previewOrigins(
          process.env.PROVN_BUILD_PREVIEW_ORIGINS,
          publicEnv.siteUrl,
        ),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return studioError(error);
  }
}
