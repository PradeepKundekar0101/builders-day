import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "@playwright/test";

const envFile = new URL("../../.env.test", import.meta.url);
const testEnv = existsSync(envFile)
  ? (parseEnv(readFileSync(envFile, "utf8")) as Record<string, string>)
  : {};
for (const [key, value] of Object.entries(testEnv)) process.env[key] ??= value;

const remote = process.env.E2E_BASE_URL;
const baseURL = remote ?? "http://localhost:3100";

export default defineConfig({
  testDir: "e2e",
  globalSetup: "./e2e/global-setup.ts",
  // A deployment adds real network round trips to every step; local runs keep the tight budget.
  timeout: remote ? 60_000 : 30_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL, trace: "retain-on-failure", screenshot: "only-on-failure" },
  projects: [
    { name: "desktop", use: { browserName: "chromium", viewport: { width: 1280, height: 800 } } },
    {
      name: "mobile",
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  webServer: remote
    ? undefined
    : {
        command: process.env.CI ? "pnpm start" : "pnpm dev",
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
        env: {
          NEXT_PUBLIC_SUPABASE_URL: process.env.SUPABASE_URL ?? "",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
          NEXT_PUBLIC_SITE_URL: baseURL,
          NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true",
          SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
          MASK_MAP_KEY: process.env.MASK_MAP_KEY ?? "",
          AGENT_API_TOKEN: process.env.AGENT_API_TOKEN ?? "",
        },
      },
});
