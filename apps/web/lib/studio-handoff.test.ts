import { expect, test } from "vitest";
import { readHandoff, writeHandoff, studioSignInPath, type StudioHandoff } from "./studio-handoff";
import { DEFAULT_PROFILE } from "./provn-demo";
const id = "00000000-0000-4000-8000-000000000001";
const value: StudioHandoff = {
  version: 1,
  createdAt: 1000,
  idea: "An unsaved booking portal idea",
  draft: null,
  pendingMessage: "Also add recurring bookings",
  specText: "{unfinished JSON",
  profile: DEFAULT_PROFILE,
  onboarded: true,
  tab: "schema",
};
const memory = () => {
  const data = new Map<string, string>();
  return {
    setItem: (k: string, v: string) => {
      data.set(k, v);
    },
    getItem: (k: string) => data.get(k) ?? null,
    removeItem: (k: string) => {
      data.delete(k);
    },
  };
};
test("same-tab handoff preserves input, unfinished editor and preferences without placing content in the URL", () => {
  const storage = memory();
  writeHandoff(storage, id, value);
  expect(readHandoff(storage, id, 1001)).toEqual(value);
  const next = new URL(studioSignInPath(id), "https://provn.test").searchParams.get("next");
  expect(next).toBe(`/apps/new?resume=${id}`);
  expect(studioSignInPath(id)).not.toContain("booking");
  expect(readHandoff(storage, id, 1002)).toEqual(value); // Refresh/retry does not consume it.
});
test("rejects malformed IDs and expired or missing drafts", () => {
  const storage = memory();
  expect(() => readHandoff(storage, id)).toThrow("not found");
  expect(() => studioSignInPath("https://evil.test")).toThrow();
  writeHandoff(storage, id, value);
  expect(() => readHandoff(storage, id, 86402000)).toThrow("expired");
  expect(() => readHandoff(storage, id, 1001)).toThrow("not found");
});
test("storage failures are surfaced before navigating away", () => {
  expect(() =>
    writeHandoff(
      {
        setItem() {
          throw new Error("Quota exceeded");
        },
      },
      id,
      value,
    ),
  ).toThrow("Quota");
});

test("preserves a shaped brief, answers and unsent conversation across login", async () => {
  const { MockPromptStudioAdapter } = await import("@buildwise/shared");
  const draft = await new MockPromptStudioAdapter().interpret({
    idea: "Build a booking platform for independent coaches and their customers.",
    links: [],
  });
  const storage = memory();
  const snapshot = {
    ...value,
    draft,
    pendingMessage: "Add a cancellation policy before publishing",
  };
  writeHandoff(storage, id, snapshot);
  expect(readHandoff(storage, id, 1001)).toEqual(snapshot);
});
