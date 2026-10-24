import { z } from "zod";
import { StudioBuildEventSchema } from "./build-events";

export const BuildFeedQuery = z.object({
  session: z.uuid(),
  stage: z.coerce.number().int().min(0).max(3),
  after: z.coerce.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).default(0),
});
export function previewOrigins(value: string | undefined, host: string) {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const url = new URL(s);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.origin === new URL(host).origin ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw new Error("Invalid build preview origin configuration");
      return url.origin;
    });
}
/** Only the dedicated worker event contract reaches the browser. Never expose raw logs. */
export function buildFeedEvents(
  rows: { id: number; type: string; payload: unknown }[],
  runId: string,
  stage: number,
) {
  return rows.flatMap((row) => {
    if (row.type !== "studio" || !row.payload || typeof row.payload !== "object") return [];
    const parsed = StudioBuildEventSchema.safeParse({ ...row.payload, runId, sequence: row.id });
    return parsed.success && parsed.data.stage === stage ? [parsed.data] : [];
  });
}
