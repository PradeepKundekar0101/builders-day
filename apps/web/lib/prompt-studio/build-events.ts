import { z } from "zod";
import type { PromptStudioDraft } from "@buildwise/shared";
export const StudioBuildEventSchema = z.object({
  runId: z.string().min(1).max(100),
  sequence: z.number().int().positive(),
  stage: z.number().int().min(0).max(3),
  type: z.enum(["started", "completed", "failed", "preview"]),
  message: z.string().max(500).optional(),
  previewUrl: z.url().optional(),
});
export type StudioBuildEvent = z.infer<typeof StudioBuildEventSchema>;
export type StudioBuildState = {
  sequence: number;
  completedStage: number | null;
  error: string;
  previewUrl?: string;
};
/** The host supplies an authenticated, session-owned stream and trusted preview origins. */
export type StudioBuildConnection = {
  runId: string;
  onDraftChange?: (draft: PromptStudioDraft) => void;
  allowedPreviewOrigins: readonly string[];
  subscribe: (receive: (event: unknown) => void, fail: () => void) => () => void;
};
export function acceptBuildEvent(
  state: StudioBuildState,
  raw: unknown,
  runId: string,
  stage: number,
  allowedOrigins: readonly string[],
  hostOrigin: string,
): StudioBuildState {
  const parsed = StudioBuildEventSchema.safeParse(raw);
  if (!parsed.success) return state;
  const event = parsed.data;
  if (event.runId !== runId || event.sequence <= state.sequence || event.stage !== stage)
    return state;
  const next = { ...state, sequence: event.sequence };
  if (event.type === "failed")
    return {
      ...next,
      completedStage: null,
      error: "The build engine reported a failure. Progression is paused.",
    };
  if (event.type === "started") return { ...next, completedStage: null, error: "" };
  if (event.type === "completed") return { ...next, completedStage: stage, error: "" };
  if (event.previewUrl) {
    const url = new URL(event.previewUrl);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.origin !== hostOrigin &&
      allowedOrigins.includes(url.origin)
    )
      return { ...next, previewUrl: url.href };
  }
  return next;
}
