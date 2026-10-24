import { describe, it, expect } from "vitest";
import { acceptBuildEvent, type StudioBuildState } from "./build-events";
const initial: StudioBuildState = { sequence: 0, completedStage: null, error: "" };
const apply = (event: unknown, state = initial) =>
  acceptBuildEvent(
    state,
    event,
    "run-1",
    1,
    ["https://preview.example.com"],
    "https://provn.example.com",
  );
describe("build stream boundary", () => {
  it("ignores other runs, stages, malformed events and replayed sequences", () => {
    const event = { runId: "run-1", sequence: 2, stage: 1, type: "completed" };
    expect(apply({ ...event, runId: "another" })).toEqual(initial);
    expect(apply({ ...event, stage: 2 })).toEqual(initial);
    expect(apply({ ...event, sequence: 0 })).toEqual(initial);
    const completed = apply(event);
    expect(completed.completedStage).toBe(1);
    expect(apply({ ...event, type: "failed" }, completed)).toEqual(completed);
  });
  it("clears completion when a stage fails", () => {
    const result = apply(
      { runId: "run-1", sequence: 3, stage: 1, type: "failed" },
      { ...initial, completedStage: 1 },
    );
    expect(result.completedStage).toBeNull();
    expect(result.error).toContain("paused");
  });
  it("allows only HTTPS preview origins explicitly supplied by the host", () => {
    for (const previewUrl of [
      "https://evil.example.com/",
      "https://user:secret@preview.example.com/",
      "http://preview.example.com/",
      "https://provn.example.com/",
    ])
      expect(
        apply({ runId: "run-1", sequence: 1, stage: 1, type: "preview", previewUrl }).previewUrl,
      ).toBeUndefined();
    expect(
      apply({
        runId: "run-1",
        sequence: 1,
        stage: 1,
        type: "preview",
        previewUrl: "https://preview.example.com/app",
      }).previewUrl,
    ).toBe("https://preview.example.com/app");
  });
});
