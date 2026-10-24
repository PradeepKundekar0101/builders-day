import { describe, it, expect } from "vitest";
import { BuildFeedQuery, buildFeedEvents, previewOrigins } from "./build-feed";
describe("server build feed", () => {
  it("rejects malformed identifiers, stages and cursors", () => {
    for (const q of [
      { session: "bad", stage: 0 },
      { session: crypto.randomUUID(), stage: 4 },
      { session: crypto.randomUUID(), stage: 0, after: -1 },
    ])
      expect(BuildFeedQuery.safeParse(q).success).toBe(false);
  });
  it("never exposes raw worker logs and assigns authoritative run and sequence", () => {
    expect(
      buildFeedEvents(
        [
          { id: 1, type: "command", payload: { secret: "private raw log" } },
          { id: 2, type: "studio", payload: { stage: 1, type: "completed" } },
          {
            id: 3,
            type: "studio",
            payload: {
              stage: 0,
              type: "completed",
              runId: "spoof",
              sequence: 999,
              secret: "private",
            },
          },
        ],
        "run",
        0,
      ),
    ).toEqual([{ runId: "run", sequence: 3, stage: 0, type: "completed" }]);
  });
  it("accepts only explicit isolated HTTPS origins", () => {
    expect(previewOrigins("https://preview.example.com", "https://host.example.com")).toEqual([
      "https://preview.example.com",
    ]);
    for (const value of [
      "http://preview.example.com",
      "https://host.example.com",
      "https://preview.example.com/path",
      "https://user:pass@preview.example.com",
    ])
      expect(() => previewOrigins(value, "https://host.example.com")).toThrow();
  });
});
