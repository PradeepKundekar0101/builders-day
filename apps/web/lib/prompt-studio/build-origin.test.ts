import { it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
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
const quote = { data: { spec_id: "spec-1", weights_version: "source-v1" }, error: null };

it("accepts a source-v1 quote whose spec came from a reviewed Studio version", async () => {
  const { db, selected } = fakeDb({
    quotes: quote,
    studio_build_specs: { data: { spec_id: "spec-1" }, error: null },
  });
  await expect(quoteFromReviewedStudio(db, "run", "user")).resolves.toBe(true);
  // studio_build_specs has no weights_version column; asking for it broke every real build start.
  expect(selected.studio_build_specs).toBe("spec_id");
});

it("rejects quotes that are missing, from another pricing version, or not from the Studio", async () => {
  expect(
    await quoteFromReviewedStudio(fakeDb({ quotes: { data: null, error: null } }).db, "r", "u"),
  ).toBe(false);
  expect(
    await quoteFromReviewedStudio(
      fakeDb({ quotes: { data: { spec_id: "s", weights_version: "other" }, error: null } }).db,
      "r",
      "u",
    ),
  ).toBe(false);
  expect(
    await quoteFromReviewedStudio(
      fakeDb({ quotes: quote, studio_build_specs: { data: null, error: null } }).db,
      "r",
      "u",
    ),
  ).toBe(false);
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
