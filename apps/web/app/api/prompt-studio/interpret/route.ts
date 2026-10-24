import { DEFAULT_PROMPT_STUDIO_MODEL, interpretWithModel } from "@/lib/prompt-studio/model";
import { readStudioJson, requireStudioOrigin, StudioHttpError } from "@/lib/prompt-studio/request";
import { studioError, studioUser } from "@/lib/prompt-studio/server";
import { publicEnv } from "@/lib/public-env";
// Per-process guard for the initial single-instance pilot, not distributed billing enforcement.
const limits = new Map<string, { until: number; calls: number; active: boolean }>();
export async function POST(request: Request) {
  let slot: { until: number; calls: number; active: boolean } | undefined;
  let acquired = false;
  try {
    requireStudioOrigin(request, publicEnv.siteUrl);
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (process.env.PROMPT_STUDIO_LIVE_ENABLED !== "true" || !apiKey)
      throw new StudioHttpError(
        503,
        "Live Prompt Studio is not configured. Set server-side provider credentials and enable the adapter. Your idea is preserved.",
      );
    const id = await studioUser();
    const now = Date.now();
    for (const [key, value] of limits) if (value.until < now && !value.active) limits.delete(key);
    slot = limits.get(id);
    if (slot?.active || (slot && slot.calls >= 10))
      throw new StudioHttpError(
        429,
        "Please wait. Live intake permits one active request and ten requests per ten minutes.",
      );
    slot ??= { until: now + 600000, calls: 0, active: false };
    limits.set(id, slot);
    slot.calls++;
    slot.active = true;
    acquired = true;
    const result = await interpretWithModel(
      await readStudioJson(request),
      { apiKey, model: process.env.PROMPT_STUDIO_MODEL || DEFAULT_PROMPT_STUDIO_MODEL },
      request.signal,
    );
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name))
      return Response.json(
        {
          error:
            "Model request cancelled or timed out. Your idea and brief are preserved. Provider usage may still apply.",
        },
        { status: 504 },
      );
    return studioError(error);
  } finally {
    if (slot && acquired) slot.active = false;
  }
}
