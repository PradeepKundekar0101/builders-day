import { it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_PRICING_VERSION } from "@buildwise/estimator";
import { quoteFromReviewedStudio } from "./build-origin";

function fakeDb(rows: Record<string, { data: unknown; error: unknown }>) {
  const selected: Record<string, string> = {};
  const db = {
    from(table: string) {
      const chain = {
        select(columns: string) {
          selected[table] = columns;
          return chain;
        },
        eq: () => chain,
        maybeSingle: async () => rows[table],
      };
      return chain;
    },
  };
  return { db: db as unknown as SupabaseClient, selected };
}
const quote = { data: { spec_id: "spec-1", weights_version: STUDIO_PRICING_VERSION }, error: null };

it("accepts a current-pricing quote whose spec came from a reviewed Studio version", async () => {
  const { db, selected } = fakeDb({
    quotes: quote,
    studio_build_specs: { data: { spec_id: "spec-1" }, error: null },
  });
  await expect(quoteFromReviewedStudio(db, "run", "user")).resolves.toBe("ok");
  // studio_build_specs has no weights_version column; asking for it broke every real build start.
  expect(selected.studio_build_specs).toBe("spec_id");
});

it("rejects quotes that are missing, not from the Studio, or on outdated pricing", async () => {
  expect(
    await quoteFromReviewedStudio(fakeDb({ quotes: { data: null, error: null } }).db, "r", "u"),
  ).toBe("not_studio");
  expect(
    await quoteFromReviewedStudio(
      fakeDb({ quotes: quote, studio_build_specs: { data: null, error: null } }).db,
      "r",
      "u",
    ),
  ).toBe("not_studio");
  // source-v1 quotes predate the agent base and are too small for a code build.
  expect(
    await quoteFromReviewedStudio(
      fakeDb({
        quotes: { data: { spec_id: "s", weights_version: "source-v1" }, error: null },
        studio_build_specs: { data: { spec_id: "s" }, error: null },
      }).db,
      "r",
      "u",
    ),
  ).toBe("stale_pricing");
});
it("reports storage errors instead of calling the quote unreviewed", async () => {
  const { db } = fakeDb({
    quotes: quote,
    studio_build_specs: { data: null, error: { message: "column does not exist" } },
  });
  await expect(quoteFromReviewedStudio(db, "r", "u")).rejects.toThrow(
    "Reviewed version lookup failed",
  );
});
