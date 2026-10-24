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

test.each(["/\t/evil.com", "/\n/evil.com", "/\r/evil.com", "/\\/evil.com", "/%5C/evil.com"])(
  "rejects control-character and backslash tricks: %j",
  (raw) => {
    expect(new URL(safeNext(raw), "http://site.test").origin).toBe("http://site.test");
  },
);

test("keeps query and hash", () => {
  expect(safeNext("/apps?x=1#top")).toBe("/apps?x=1#top");
});
