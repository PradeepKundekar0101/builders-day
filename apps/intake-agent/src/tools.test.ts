import { describe, expect, test } from "vitest";
import type { AgentApi } from "./api";
import { askUser, submitSpec } from "./tools";

function fakeApi(overrides: Partial<AgentApi> = {}): AgentApi {
  return {
    listSubmittedIdeas: async () => [],
    askQuestion: async () => ({ ok: true, messageId: "m1" }),
    waitForAnswer: async () => "Office workers order lunch.",
    submitSpec: async () => ({ ok: true, costUsd: 4.96, flagged: false }),
    ...overrides,
  };
}

describe("ask_user", () => {
  test("returns the founder's answer", async () => {
    expect(await askUser(fakeApi(), "idea-1", "Who orders?")).toBe("Office workers order lunch.");
  });

  test("tells the model to stop asking when the question limit is reached", async () => {
    const api = fakeApi({ askQuestion: async () => ({ ok: false, reason: "question_limit" }) });
    expect(await askUser(api, "idea-1", "Fifth?")).toMatch(/no more questions.*submit_spec/i);
  });

  test("tells the model to proceed with assumptions when the founder does not reply", async () => {
    const api = fakeApi({ waitForAnswer: async () => null });
    expect(await askUser(api, "idea-1", "Who orders?")).toMatch(
      /did not answer.*reasonable assumption/i,
    );
  });
});

describe("submit_spec", () => {
  test("confirms an accepted spec", async () => {
    expect(await submitSpec(fakeApi(), "idea-1", {})).toMatch(/accepted.*\$4\.96/i);
  });

  test("returns validation issues so the model can fix the spec", async () => {
    const api = fakeApi({
      submitSpec: async () => ({
        ok: false,
        issues: [{ path: ["pages"], message: "Too small: expected array to have >=1 items" }],
      }),
    });
    expect(await submitSpec(api, "idea-1", {})).toMatch(/pages: Too small/);
  });
});
