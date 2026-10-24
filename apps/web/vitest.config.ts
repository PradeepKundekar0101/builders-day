import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["lib/**/*.test.ts"], exclude: ["**/*.db.test.ts", "**/node_modules/**"] },
});
