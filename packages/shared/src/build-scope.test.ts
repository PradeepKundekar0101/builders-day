import { it, expect } from "vitest";
import { buildScopeIssues, BUILD_SCOPE_RULES } from "./build-scope";
import { SpecSchema } from "./spec";

const base = SpecSchema.parse({
  name: "Coach Booking Portal",
  summary: "Book sessions",
  pages: [{ name: "Home", purpose: "Welcome", mustHave: true }],
  entities: [
    {
      name: "bookings",
      ownerScoped: true,
      mustHave: true,
      fields: [{ name: "title", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
});

it("accepts pages, email sign-in and owner-scoped data", () => {
  expect(buildScopeIssues(base)).toEqual([]);
});

it("names each integration that blocks the build", () => {
  const issues = buildScopeIssues({
    ...base,
    integrations: [
      { kind: "admin_dashboard", mustHave: true, notes: "Owner-only bookings page" },
      { kind: "payment_pinelabs", mustHave: false },
    ],
  });
  expect(issues).toEqual([
    'An admin or owner dashboard across all users\' data (integration "admin_dashboard") is not supported yet.',
    'Payments (integration "payment_pinelabs") is not supported yet.',
  ]);
});

it("flags unsupported sign-in, data without sign-in and oversized briefs", () => {
  expect(buildScopeIssues({ ...base, auth: { enabled: true, providers: ["google"] } })).toEqual([
    "Only email sign-in is supported. Remove other sign-in providers.",
  ]);
  expect(buildScopeIssues({ ...base, auth: { enabled: false, providers: [] } })).toEqual([
    "Data entities need email sign-in. Turn on authentication.",
  ]);
  const pages = Array.from({ length: 13 }, (_, i) => ({
    name: `P${i}`,
    purpose: "x",
    mustHave: false,
  }));
  expect(buildScopeIssues({ ...base, pages })).toEqual([
    "At most 12 pages are supported (this brief has 13).",
  ]);
});

it("tells the intake model the same limits the builder enforces", () => {
  expect(BUILD_SCOPE_RULES).toContain("Always set integrations to []");
  expect(BUILD_SCOPE_RULES).toContain("owner-scoped");
  expect(BUILD_SCOPE_RULES).toContain("up to 12 pages");
});
