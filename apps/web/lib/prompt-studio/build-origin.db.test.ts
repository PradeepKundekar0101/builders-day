import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, expect, test } from "vitest";
import { STUDIO_PRICING_VERSION } from "@buildwise/estimator";
import { quoteFromReviewedStudio } from "./build-origin";

const db = createClient(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  {
    auth: { persistSession: false, autoRefreshToken: false },
  },
);
let userId: string, quoteId: string;

beforeAll(async () => {
  const user = await db.auth.admin.createUser({
    email: `origin-${randomUUID()}@test.buildwise.local`,
    email_confirm: true,
  });
  if (user.error) throw user.error;
  userId = user.data.user.id;
  const idea = await db
    .from("ideas")
    .insert({
      user_id: userId,
      text: "A study planner where students track subjects, tasks and notes.",
    })
    .select("id")
    .single();
  if (idea.error) throw idea.error;
  const spec = await db
    .from("specs")
    .insert({ idea_id: idea.data.id, user_id: userId, spec: {} })
    .select("id")
    .single();
  if (spec.error) throw spec.error;
  const quote = await db
    .from("quotes")
    .insert({
      spec_id: spec.data.id,
      user_id: userId,
      cost_usd: 1,
      low_usd: 1,
      high_usd: 1,
      hours: 1,
      model_budget_usd: 1,
      weights_version: STUDIO_PRICING_VERSION,
      share_slug: randomUUID(),
    })
    .select("id")
    .single();
  if (quote.error) throw quote.error;
  quoteId = quote.data.id;
});

test("the reviewed-version check runs against the real schema", async () => {
  // This quote exists but has no Studio version, so the check reaches studio_build_specs.
  // Selecting a column that table lacks used to fail here and block every real build.
  await expect(quoteFromReviewedStudio(db, quoteId, userId)).resolves.toBe("not_studio");
  await expect(quoteFromReviewedStudio(db, randomUUID(), userId)).resolves.toBe("not_studio");
});
