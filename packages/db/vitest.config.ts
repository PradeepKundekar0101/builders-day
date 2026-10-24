import { readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { defineConfig } from "vitest/config";

const env = parseEnv(readFileSync(new URL("../../.env.test", import.meta.url), "utf8"));

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    env: env as Record<string, string>,
    testTimeout: 20_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
