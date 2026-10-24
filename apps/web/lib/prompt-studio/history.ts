import { z } from "zod";
import { PromptStudioDraftSchema, type PromptStudioDraft } from "@buildwise/shared";
export const StudioVersionSchema = z.object({
  revision: z.number().int().positive(),
  payload: PromptStudioDraftSchema,
  status: z.enum(["draft", "user_reviewed"]),
  created_at: z.string(),
});
export type StudioVersion = z.infer<typeof StudioVersionSchema>;
export type SaveAttempt = {
  fingerprint: string;
  body: {
    id: string;
    mutationId: string;
    expectedRevision: number;
    draft: PromptStudioDraft;
    status: "draft" | "user_reviewed";
  };
};
/** Reuse the same mutation after a lost response; edited content gets a fresh mutation. */
export function prepareSaveAttempt(
  previous: SaveAttempt | null,
  session: { id: string; revision: number } | null,
  draft: PromptStudioDraft,
  status: "draft" | "user_reviewed",
  uuid = () => crypto.randomUUID(),
): SaveAttempt {
  const fingerprint = JSON.stringify({ session, draft, status });
  if (previous?.fingerprint === fingerprint) return previous;
  return {
    fingerprint,
    body: {
      id: session?.id ?? uuid(),
      mutationId: uuid(),
      expectedRevision: session?.revision ?? 0,
      draft,
      status,
    },
  };
}
