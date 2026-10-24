import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@buildwise/db";
import { publicEnv } from "@/lib/public-env";
import { serverEnv } from "./env";

let client: SupabaseClient<Database> | undefined;

/** Service-role client. Bypasses RLS, so every caller must check ownership itself. */
export function adminClient(): SupabaseClient<Database> {
  client ??= createClient<Database>(publicEnv.supabaseUrl, serverEnv().serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
