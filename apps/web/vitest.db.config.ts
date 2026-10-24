import { defineConfig } from "vitest/config";

/** Integration tests against local Supabase; run with the values from scripts/supabase-env.sh. */
export default defineConfig({ test: { include: ["lib/**/*.db.test.ts"] } });
