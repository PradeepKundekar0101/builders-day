import { describe, expect, test } from "vitest";
import { parsePublicEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("parsePublicEnv", () => {
  test("uses the Vercel branch URL for previews without overriding production", () => {
    expect(
      parsePublicEnv({
        ...valid,
        NEXT_PUBLIC_SITE_URL: undefined,
        NEXT_PUBLIC_VERCEL_BRANCH_URL: "buildwise-preview.vercel.app",
      }).siteUrl,
    ).toBe("https://buildwise-preview.vercel.app");
    expect(
      parsePublicEnv({
        ...valid,
        NEXT_PUBLIC_VERCEL_BRANCH_URL: "buildwise-preview.vercel.app",
      }).siteUrl,
    ).toBe(valid.NEXT_PUBLIC_SITE_URL);
  });
  test("throws naming every missing variable", () => {
    expect(() => parsePublicEnv({})).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL[\s\S]*NEXT_PUBLIC_SUPABASE_ANON_KEY[\s\S]*NEXT_PUBLIC_SITE_URL/,
    );
  });

  test("throws naming a non-URL Supabase URL", () => {
    expect(() => parsePublicEnv({ ...valid, NEXT_PUBLIC_SUPABASE_URL: "not a url" })).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/,
    );
  });

  test("maps valid input", () => {
    expect(parsePublicEnv(valid)).toEqual({
      supabaseUrl: "http://127.0.0.1:54321",
      supabaseAnonKey: "anon-key",
      siteUrl: "http://localhost:3000",
    });
  });
});
