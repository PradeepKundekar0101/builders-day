import { expect, it } from "vitest";
import { buildReturnUrl, checkoutUrl, readBuildContext, topupAmount } from "./build-context";
const context = { session: "11111111-1111-4111-8111-111111111111", revision: 3 };
it("preserves the reviewed build through checkout and return", () => {
  const checkout = new URL(checkoutUrl(context, 350, 100), "https://example.com");
  expect(checkout.searchParams.get("amount")).toBe("250");
  expect(readBuildContext(checkout.searchParams)).toEqual(context);
  const back = new URL(buildReturnUrl(context), "https://example.com");
  expect(back.pathname).toBe("/apps/build");
  expect(back.searchParams.get("resume")).toBe("1");
  expect(readBuildContext(back.searchParams)).toEqual(context);
});
it("handles fractional shortfalls and purchase limits", () => {
  expect(topupAmount(200.5, 100)).toBe(101);
  expect(topupAmount(101, 100)).toBe(100);
  expect(topupAmount(20000, 0)).toBe(10000);
});
it("does not turn malformed checkout context into a redirect", () => {
  expect(readBuildContext(new URLSearchParams("session=https://evil.test&revision=1"))).toBeNull();
  expect(
    readBuildContext(new URLSearchParams(`session=${context.session}&revision=-1`)),
  ).toBeNull();
});
