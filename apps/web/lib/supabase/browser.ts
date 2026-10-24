import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@buildwise/db";
import { publicEnv } from "@/lib/public-env";

export function createSupabaseBrowserClient(): SupabaseClient<Database> {
  return createBrowserClient<Database>(publicEnv.supabaseUrl, publicEnv.supabaseAnonKey);
}
