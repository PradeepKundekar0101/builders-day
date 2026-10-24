import { it, expect } from "vitest";
import { MockPromptStudioAdapter } from "@buildwise/shared";
import { prepareSaveAttempt } from "./history";
it("reuses an identical save after response loss and gives edits a new mutation", async () => {
  const draft = await new MockPromptStudioAdapter().interpret({
    idea: "Build a booking portal for coaches where clients browse and reserve fitness sessions.",
    links: [],
  });
  let n = 0;
  const uuid = () => `id-${++n}`;
  const attempt = prepareSaveAttempt(null, null, draft, "draft", uuid);
  expect(prepareSaveAttempt(attempt, null, draft, "draft", uuid)).toBe(attempt);
  expect(n).toBe(2);
  const edited = prepareSaveAttempt(
    attempt,
    { id: "session", revision: 2 },
    { ...draft, buildStage: 2 },
    "draft",
    uuid,
  );
  expect(edited.body.id).toBe("session");
  expect(edited.body.expectedRevision).toBe(2);
  expect(edited.body.mutationId).not.toBe(attempt.body.mutationId);
});
