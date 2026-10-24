import { expect, test } from "vitest";
import { safeNext } from "./safe-next";

test.each(["/apps", "/apps/123?x=1"])("keeps same-site path %s", (path) => {
  expect(safeNext(path)).toBe(path);
});

test.each([null, "", "//evil.com", "/\\evil.com", "https://evil.com", "apps"])(
  "falls back to /apps for %s",
  (raw) => {
    expect(safeNext(raw)).toBe("/apps");
  },
);
