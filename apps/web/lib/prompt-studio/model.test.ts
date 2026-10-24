import { describe, expect, it, vi } from "vitest";
import { MockPromptStudioAdapter } from "@buildwise/shared";
import { interpretWithModel, prepareInterpretation } from "./model";
const input = {
  idea: "Build a booking portal where clients can reserve fitness sessions and coaches can manage their schedules.",
  links: [],
};
const config = { apiKey: "test-not-a-real-key", model: "configured-model" };
async function fixture() {
  const draft = await new MockPromptStudioAdapter().interpret(input);
  return {
    spec: draft.spec,
    questions: [],
    acceptanceCriteria: ["A client can reserve an available session."],
    assumptions: ["Payments are deferred."],
    changeSummary: "Defined the booking flow.",
  };
}
function provider(value: unknown, stopReason = "end_turn") {
  return vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: "msg_test",
          type: "message",
          role: "assistant",
          model: "configured-model",
          content: [
            { type: "thinking", thinking: "", signature: "sig" },
            { type: "text", text: JSON.stringify(value) },
          ],
          stop_reason: stopReason,
          stop_details: null,
          usage: { input_tokens: 100, output_tokens: 200 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
  ) as unknown as typeof fetch;
}
function sentBody(f: typeof fetch) {
  return JSON.parse(vi.mocked(f).mock.calls[0][1]?.body as string);
}
describe("live intake adapter", () => {
  it("validates output, records usage, and never lets the model choose revision or provenance", async () => {
    const f = provider(await fixture());
    const r = await interpretWithModel({ input }, config, undefined, f);
    expect(r.draft.adapterMode).toBe("claude");
    expect(r.draft.revision).toBe(1);
    expect(r.trace.provider).toBe("Anthropic");
    expect(r.trace.responseId).toBe("msg_test");
    expect(r.trace.usage.output_tokens).toBe(200);
    const request = sentBody(f);
    expect(request.model).toBe("configured-model");
    expect(request.system).toBe(r.trace.instructions);
    // The intake designs within what the builder can make, so reviewed briefs are buildable.
    expect(request.system).toContain("Always set integrations to []");
    expect(request.messages).toEqual([{ role: "user", content: r.trace.input }]);
    expect(request.output_config.format.type).toBe("json_schema");
    expect(request.fallbacks).toBe("default");
    expect(request.tools).toBeUndefined();
  });
  it("sends the key only to the Anthropic API and never retries", async () => {
    const f = vi.fn(
      async () => new Response("overloaded", { status: 529 }),
    ) as unknown as typeof fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(interpretWithModel({ input }, config, undefined, f)).rejects.toThrow(
      "Your brief is preserved",
    );
    log.mockRestore();
    expect(f).toHaveBeenCalledTimes(1);
    const [url, init] = vi.mocked(f).mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/api\.anthropic\.com\/v1\/messages/);
    expect([...new Headers(init?.headers).values()].join(" ")).toContain(config.apiKey);
  });
  it("treats refusals and truncated responses as failures without replacing the brief", async () => {
    await expect(
      interpretWithModel({ input }, config, undefined, provider(await fixture(), "refusal")),
    ).rejects.toThrow("declined");
    await expect(
      interpretWithModel({ input }, config, undefined, provider(await fixture(), "max_tokens")),
    ).rejects.toThrow("did not complete");
  });
  it("reports caller cancellation as an AbortError", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(
      interpretWithModel({ input }, config, controller.signal, provider(await fixture())),
    ).rejects.toMatchObject({ name: "AbortError" });
  });
  it("suppresses upfront questions even if the model returns them", async () => {
    const output = {
      ...(await fixture()),
      questions: [{ id: "payment", question: "Which payment provider?" }],
    };
    const result = await interpretWithModel({ input }, config, undefined, provider(output));
    expect(result.draft.buildStage).toBe(0);
    expect(result.draft.questions).toEqual([]);
  });
  it("reveals at most one new decision tagged to the active stage", async () => {
    const draft = {
      ...(await new MockPromptStudioAdapter().interpret(input)),
      questions: [],
      buildStage: 2,
    };
    const output = {
      ...(await fixture()),
      questions: [
        { id: "storage", question: "What should be saved?" },
        { id: "later", question: "Where should it deploy?" },
      ],
    };
    const result = await interpretWithModel({ input, draft }, config, undefined, provider(output));
    expect(result.draft.buildStage).toBe(2);
    expect(result.draft.questions).toEqual([
      { id: "storage", question: "What should be saved?", stage: 2 },
    ]);
  });
  it("rejects cloud calls for local-only mode before fetching", async () => {
    const draft = await new MockPromptStudioAdapter().interpret(input);
    draft.onboarding = {
      persona: "non-tech",
      mode: "plain",
      budgetCap: 200,
      approvalThreshold: 50,
      plan: "free",
      privateMode: true,
      byok: false,
    };
    const f = provider(await fixture());
    await expect(interpretWithModel({ input, draft }, config, undefined, f)).rejects.toThrow(
      "Local-only",
    );
    expect(f).not.toHaveBeenCalled();
  });
  it("masks input and removes URL credentials and query strings before dispatch", () => {
    const p = prepareInterpretation({
      input: {
        ...input,
        idea: input.idea + " api_key=supersecretvalue email me at person@example.com",
        links: ["https://user:password@example.com/?secret=x"],
      },
    });
    expect(p.context).not.toContain("supersecretvalue");
    expect(p.context).not.toContain("person@example.com");
    expect(p.input.links).toEqual(["https://example.com/"]);
  });
  it("preserves answered decisions and bounds follow-ups", async () => {
    const draft = await new MockPromptStudioAdapter().interpret(input);
    draft.questions[0].answer = "Clients and coaches";
    const output = await fixture();
    const r = await interpretWithModel(
      { input, draft, message: "Clients and coaches" },
      config,
      undefined,
      provider(output),
    );
    expect(r.draft.questions[0].answer).toBe("Clients and coaches");
    expect(r.draft.questions).toHaveLength(3);
    expect(r.draft.revision).toBe(2);
  });
  it("does not replace the brief with malformed model output", async () => {
    await expect(
      interpretWithModel({ input }, config, undefined, provider({ spec: {} })),
    ).rejects.toThrow("invalid brief");
  });
  it("surfaces provider errors without exposing provider body or credentials", async () => {
    const f = vi.fn(
      async () => new Response("sensitive provider error", { status: 429 }),
    ) as unknown as typeof fetch;
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = await interpretWithModel({ input }, config, undefined, f).catch((e) => e);
    expect(error.status).toBe(429);
    expect(error.message).toContain("Your brief is preserved");
    expect(error.message).not.toContain("sensitive");
    expect(JSON.stringify(log.mock.calls)).not.toMatch(/sensitive|test-not-a-real-key/);
    log.mockRestore();
  });
});
