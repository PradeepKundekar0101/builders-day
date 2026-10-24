import { describe, expect, test } from "vitest";
import { parsePublicEnv } from "./env";

const valid = {
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  NEXT_PUBLIC_SITE_URL: "http://localhost:3000",
};

describe("parsePublicEnv", () => {
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
      googleAuthEnabled: false,
    });
  });

  test("Google sign-in is enabled only by the explicit flag", () => {
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "true" }).googleAuthEnabled,
    ).toBe(true);
    expect(
      parsePublicEnv({ ...valid, NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: "yes" }).googleAuthEnabled,
    ).toBe(false);
  });

  test("falls back to the Vercel branch URL when no site URL is set", () => {
    const branchOnly = {
      ...valid,
      NEXT_PUBLIC_SITE_URL: undefined,
      NEXT_PUBLIC_VERCEL_BRANCH_URL: "buildwise-git-x.vercel.app",
    };
    expect(parsePublicEnv(branchOnly).siteUrl).toBe("https://buildwise-git-x.vercel.app");
  });
});
