import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/database.types.ts",
      "apps/web/**",
      ".superpowers/**",
      "Pine Labs Credits/**",
      "Smart Model Router/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
);
