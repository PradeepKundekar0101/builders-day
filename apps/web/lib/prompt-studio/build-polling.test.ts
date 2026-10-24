import { afterEach, expect, it, vi } from "vitest";
import { pollingBuildConnection } from "./build-polling";
import type { PromptStudioDraft } from "@buildwise/shared";
afterEach(() => vi.useRealTimers());
it("replays stages, stops on budget pause and never retries uncertain work", async () => {
  vi.useFakeTimers();
  const id = crypto.randomUUID();
  const fetcher = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json({
        runId: id,
        status: "running",
        cursor: 9,
        events: [],
        allowedPreviewOrigins: [],
      }),
    )
    .mockResolvedValueOnce(
      Response.json({
        runId: id,
        status: "paused_budget",
        cursor: 10,
        events: [],
        allowedPreviewOrigins: [],
      }),
    );
  const c = pollingBuildConnection(id, crypto.randomUUID(), [], fetcher),
    receive = vi.fn(),
    fail = vi.fn();
  const stop = c.subscribe(receive, fail);
  await vi.advanceTimersByTimeAsync(0);
  c.onDraftChange?.({ buildStage: 1 } as PromptStudioDraft);
  await vi.advanceTimersByTimeAsync(1500);
  expect(fetcher.mock.calls[1][0]).toContain("stage=1&after=0");
  expect(fail).toHaveBeenCalledOnce();
  expect(receive).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(10000);
  expect(fetcher).toHaveBeenCalledTimes(2);
  stop();
});
it("aborts its fetch and does not report a false failure after unmount", async () => {
  const fetcher = vi.fn(
    (_url, options) =>
      new Promise<Response>((_resolve, reject) =>
        options.signal.addEventListener("abort", () => reject(new Error("aborted"))),
      ),
  );
  const c = pollingBuildConnection(
    crypto.randomUUID(),
    crypto.randomUUID(),
    [],
    fetcher as typeof fetch,
  );
  const fail = vi.fn();
  c.subscribe(vi.fn(), fail)();
  await Promise.resolve();
  await Promise.resolve();
  expect(fetcher.mock.calls[0][1].signal.aborted).toBe(true);
  expect(fail).not.toHaveBeenCalled();
});
