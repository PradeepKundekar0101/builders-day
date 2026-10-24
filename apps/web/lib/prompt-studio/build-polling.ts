import type { StudioBuildConnection } from "./build-events";
import { z } from "zod";
import { StudioBuildEventSchema } from "./build-events";
export const BuildFeedSchema = z.object({
  runId: z.uuid(),
  status: z.string(),
  cursor: z.number().int().nonnegative(),
  events: z.array(StudioBuildEventSchema),
  allowedPreviewOrigins: z.array(z.url()),
});
/** Replays from zero on stage changes so a fast worker cannot outrun the UI. */
export function pollingBuildConnection(
  runId: string,
  sessionId: string,
  origins: string[],
  fetcher: typeof fetch = fetch,
): StudioBuildConnection {
  let stage = 0;
  return {
    runId,
    allowedPreviewOrigins: origins,
    onDraftChange(draft) {
      stage = draft.buildStage ?? 0;
    },
    subscribe(receive, fail) {
      let stopped = false,
        cursor = 0,
        seenStage = -1;
      let timer: ReturnType<typeof setTimeout>;
      const controller = new AbortController();
      async function poll() {
        const requestedStage = stage;
        if (seenStage !== requestedStage) {
          cursor = 0;
          seenStage = requestedStage;
        }
        try {
          const url = `/api/prompt-studio/builds/${encodeURIComponent(runId)}?session=${encodeURIComponent(sessionId)}&stage=${requestedStage}&after=${cursor}`;
          const response = await fetcher(url, { signal: controller.signal, cache: "no-store" });
          if (!response.ok) throw new Error("Build feed unavailable");
          const feed = BuildFeedSchema.parse(await response.json());
          if (feed.runId !== runId) throw new Error("Build mismatch");
          if (stopped) return;
          if (stage === requestedStage) {
            cursor = feed.cursor;
            if (["failed", "paused_budget"].includes(feed.status)) {
              fail();
              return;
            }
            for (const event of feed.events) receive(event);
          }
          timer = setTimeout(() => void poll(), 1500);
        } catch {
          if (!stopped) fail();
        }
      }
      void poll();
      return () => {
        stopped = true;
        clearTimeout(timer);
        controller.abort();
      };
    },
  };
}
