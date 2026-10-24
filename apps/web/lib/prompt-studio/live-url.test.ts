import { it, expect } from "vitest";
import { safeLiveUrl } from "./live-url";
it("only exposes generated Vercel app origins", () => {
  expect(safeLiveUrl("https://bw-bb276e7c2b59.vercel.app")).toBe(
    "https://bw-bb276e7c2b59.vercel.app",
  );
  for (const url of [
    "https://coach-booking-portal.provn.app",
    "http://bw-x.vercel.app",
    "https://bw-x.vercel.app/path",
    "https://evil.com/.vercel.app",
    "javascript:alert(1)",
    null,
  ])
    expect(safeLiveUrl(url)).toBeUndefined();
});
