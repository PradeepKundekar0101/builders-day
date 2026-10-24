import { z } from "zod";
import { studioUser, studioError } from "@/lib/prompt-studio/server";
import { costService } from "@/lib/cost/server";
import { StudioHttpError } from "@/lib/prompt-studio/request";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const userId = await studioUser(),
      id = z.uuid().parse((await context.params).id),
      { db } = costService();
    const { data: build, error } = await db
      .from("builds")
      .select("id,status,spent_usd,budget_usd")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new StudioHttpError(503, "Build storage unavailable");
    if (!build) throw new StudioHttpError(404, "Build not found");
    const { data: output } = await db
      .from("build_outputs")
      .select("status,message,artifact_path,checks")
      .eq("build_id", id)
      .maybeSingle();
    const { data: events } = await db
      .from("build_events")
      .select("id,payload")
      .eq("build_id", id)
      .eq("type", "progress")
      .order("id", { ascending: true })
      .limit(100);
    let downloadUrl: string | undefined;
    if (output?.status === "ready" && output.artifact_path) {
      const { data } = await db.storage
        .from("build-artifacts")
        .createSignedUrl(output.artifact_path, 60, { download: "provn-product.zip" });
      downloadUrl = data?.signedUrl;
    }
    // Same rule as released_url(): the owner sees the live URL only once the build is released.
    let liveUrl: string | undefined;
    if (build.status === "released") {
      const { data: deployment } = await db
        .from("deployments")
        .select("url")
        .eq("build_id", id)
        .eq("status", "ready")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      liveUrl =
        deployment?.url && /^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(deployment.url)
          ? deployment.url
          : undefined;
    }
    return Response.json(
      {
        build,
        status:
          build.status === "paused_budget"
            ? "needs_review"
            : build.status === "deploying"
              ? "deploying"
              : build.status === "released"
                ? "live"
                : (output?.status ?? build.status),
        message: output?.message ?? "Waiting for the build worker.",
        checks: output?.checks ?? {},
        steps: (events ?? []).map((e) => e.payload),
        downloadUrl,
        liveUrl,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return studioError(e);
  }
}
