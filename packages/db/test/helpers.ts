import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../src";

export type Client = SupabaseClient<Database>;

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set; run scripts/supabase-env.sh`);
  return value;
}

const noSession = { auth: { persistSession: false, autoRefreshToken: false } };

export function serviceClient(): Client {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_SERVICE_ROLE_KEY"), noSession);
}

export function anonClient(): Client {
  return createClient<Database>(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), noSession);
}

export async function createUserClient(
  label: string,
): Promise<{ client: Client; userId: string; email: string }> {
  const email = `${label}-${randomUUID()}@test.buildwise.local`;
  const password = randomUUID();
  const { data, error } = await serviceClient().auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error) throw error;
  const client = anonClient();
  const { error: signInError } = await client.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { client, userId: data.user.id, email };
}

export const IDEA_TEXT = "A tiffin delivery tracker for my home kitchen with orders and payments.";

export type SeededIds = {
  ideaId: string;
  specId: string;
  quoteId: string;
  buildId: string;
  deploymentId: string;
  approvalId: string;
};

function must<T>(result: { data: T | null; error: unknown }): T {
  if (result.error) throw result.error;
  if (result.data === null) throw new Error("no data");
  return result.data;
}

/** Inserts one row in every table, owned by userId, using the service role. */
export async function seedOwnedRows(userId: string): Promise<SeededIds> {
  const db = serviceClient();
  const idea = must(
    await db.from("ideas").insert({ user_id: userId, text: IDEA_TEXT }).select("id").single(),
  );
  must(
    await db
      .from("intake_messages")
      .insert({ idea_id: idea.id, role: "agent", content: "Who orders?" })
      .select("id")
      .single(),
  );
  const spec = must(
    await db
      .from("specs")
      .insert({ idea_id: idea.id, user_id: userId, spec: {} })
      .select("id")
      .single(),
  );
  const quote = must(
    await db
      .from("quotes")
      .insert({
        spec_id: spec.id,
        user_id: userId,
        cost_usd: 4.96,
        low_usd: 3.47,
        high_usd: 6.45,
        hours: 4.25,
        model_budget_usd: 1.98,
        weights_version: "v1",
        share_slug: randomUUID(),
      })
      .select("id")
      .single(),
  );
  must(
    await db
      .from("payments")
      .insert({
        quote_id: quote.id,
        user_id: userId,
        provider: "fake",
        provider_order_id: randomUUID(),
        amount_minor: 41664,
        currency: "INR",
      })
      .select("id")
      .single(),
  );
  const build = must(
    await db
      .from("builds")
      .insert({ quote_id: quote.id, user_id: userId, budget_usd: 1.98 })
      .select("id")
      .single(),
  );
  must(
    await db
      .from("build_events")
      .insert({ build_id: build.id, type: "step", payload: { text: "Started" } })
      .select("id")
      .single(),
  );
  const deployment = must(
    await db
      .from("deployments")
      .insert({ build_id: build.id, url: "https://secret.example" })
      .select("id")
      .single(),
  );
  must(await db.from("audits").insert({ deployment_id: deployment.id }).select("id").single());
  const approval = must(
    await db
      .from("approvals")
      .insert({ kind: "flagged_spec", subject_id: spec.id })
      .select("id")
      .single(),
  );
  return {
    ideaId: idea.id,
    specId: spec.id,
    quoteId: quote.id,
    buildId: build.id,
    deploymentId: deployment.id,
    approvalId: approval.id,
  };
}
