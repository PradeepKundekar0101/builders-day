import "server-only";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  PromptStudioDraftSchema,
  createStudioReview,
  sanitizeStudioDraft,
} from "@buildwise/shared";
import type { Database, Json } from "@buildwise/db";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { publicEnv } from "@/lib/public-env";
import { readStudioJson, requireStudioOrigin, StudioHttpError } from "./request";

export async function studioUser() {
  const auth = await createSupabaseServerClient();
  const { data, error } = await auth.auth.getUser();
  if (error || !data.user) throw new StudioHttpError(401, "Sign in to save your brief.");
  return data.user.id;
}
export function studioDb() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key)
    throw new StudioHttpError(
      503,
      "Draft storage is not configured. You can still export your brief.",
    );
  return createClient<Database>(publicEnv.supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
export const StudioSaveSchema = z.object({
  id: z.uuid(),
  mutationId: z.uuid(),
  expectedRevision: z.number().int().min(0),
  draft: PromptStudioDraftSchema,
  status: z.enum(["draft", "user_reviewed"]),
});
export async function saveStudio(request: Request, id?: string) {
  requireStudioOrigin(request, publicEnv.siteUrl);
  const userId = await studioUser();
  const body = StudioSaveSchema.parse(await readStudioJson(request));
  if (id && body.id !== id) throw new StudioHttpError(400, "Session does not match.");
  if ((!id && body.expectedRevision !== 0) || (id && body.expectedRevision === 0))
    throw new StudioHttpError(400, "Invalid save version.");
  // Only mock intake is wired today. Client input cannot claim live agent provenance.
  const draft = sanitizeStudioDraft({ ...body.draft, adapterMode: "mock" });
  if (body.status === "user_reviewed") createStudioReview(draft);
  const db = studioDb();
  const { data, error } = await db.rpc("save_prompt_studio", {
    p_session_id: body.id,
    p_user_id: userId,
    p_expected_revision: body.expectedRevision,
    p_mutation_id: body.mutationId,
    p_payload: draft as unknown as Json,
    p_status: body.status,
  });
  if (error) {
    if (error.code === "40001")
      throw new StudioHttpError(
        409,
        "A newer version exists. Reload it before saving; export your edits first.",
      );
    if (error.code === "P0002") throw new StudioHttpError(404, "Draft not found.");
    if (error.code === "54000") throw new StudioHttpError(429, "Daily draft limit reached.");
    throw new StudioHttpError(
      503,
      "Draft could not be saved. Check the Prompt Studio migration and storage configuration.",
    );
  }
  return Response.json(data, { headers: { "Cache-Control": "no-store" } });
}
export function studioError(error: unknown) {
  if (error instanceof StudioHttpError)
    return Response.json({ error: error.message }, { status: error.status });
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: "Check your brief fields.",
        issues: error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
      { status: 400 },
    );
  if (error instanceof Error && error.message.startsWith("Answer open questions"))
    return Response.json({ error: error.message }, { status: 400 });
  return Response.json({ error: "Prompt Studio is temporarily unavailable." }, { status: 500 });
}
