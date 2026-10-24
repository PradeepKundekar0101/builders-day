import { describe, expect, it } from "vitest";
import {
  PromptStudioInputSchema,
  PromptStudioDraftSchema,
  createStudioReview,
  compileStudioInstructions,
} from "./prompt-studio";
const fixture = () => ({
  schemaVersion: "1.0" as const,
  revision: 1,
  input: {
    idea: "Build a client portal for our agency so customers can view project updates.",
    links: [],
  },
  questions: [{ id: "roles", question: "Who can view updates?", answer: "Only their owner" }],
  spec: {
    name: "Client portal",
    summary: "Private client project updates",
    pages: [{ name: "Updates", purpose: "Read updates", mustHave: true }],
    entities: [],
    auth: { enabled: true, providers: ["email" as const] },
    integrations: [],
  },
  acceptanceCriteria: ["Another client's updates are not visible"],
  adapterMode: "mock" as const,
});
describe("Prompt Studio integration contract", () => {
  it("matches the intake input limits", () => {
    expect(PromptStudioInputSchema.safeParse({ idea: "   " }).success).toBe(false);
    expect(PromptStudioInputSchema.safeParse({ idea: "short" }).success).toBe(true);
    expect(PromptStudioInputSchema.safeParse({ idea: "a".repeat(2001) }).success).toBe(false);
    expect(
      PromptStudioInputSchema.safeParse({ idea: "a".repeat(50), links: ["javascript:alert(1)"] })
        .success,
    ).toBe(false);
  });
  it("retains canonical spec and separates user review from operator approval", () => {
    const draft = fixture();
    const result = createStudioReview(draft);
    expect(result.spec).toEqual(draft.spec);
    expect(result.status).toBe("user_reviewed");
    expect(result.instructions).toBe(compileStudioInstructions(draft));
  });
  it("blocks open decisions", () => {
    const draft = fixture();
    draft.questions[0]!.answer = "";
    expect(() => createStudioReview(draft)).toThrow();
  });
  it("rejects more than four questions and duplicate IDs", () => {
    const draft = fixture();
    draft.questions.push({ ...draft.questions[0]! });
    expect(PromptStudioDraftSchema.safeParse(draft).success).toBe(false);
    draft.questions = Array.from({ length: 5 }, (_, index) => ({
      id: String(index),
      question: "Who?",
      answer: "Customers",
    }));
    expect(PromptStudioDraftSchema.safeParse(draft).success).toBe(false);
  });
  it("delegates invalid specs to the canonical validator", () => {
    const draft = fixture();
    draft.spec.auth.providers = [];
    expect(PromptStudioDraftSchema.safeParse(draft).success).toBe(false);
  });
});

import { MockPromptStudioAdapter, maskStudioText, sanitizeStudioDraft } from "./prompt-studio";
it("mock suggests a scaffold without inventing data tables or integrations", async () => {
  const draft = await new MockPromptStudioAdapter().interpret(fixture().input);
  expect(draft.spec.entities).toEqual([]);
  expect(draft.spec.integrations).toEqual([]);
  expect(draft.adapterMode).toBe("mock");
  expect(draft.questions).toHaveLength(3);
});
it("masks common credentials and personal contact values", () => {
  expect(
    maskStudioText("api_key=supersecret password: abc contact alice@example.com"),
  ).not.toContain("supersecret");
  expect(
    maskStudioText("api_key=supersecret password: abc contact alice@example.com"),
  ).not.toContain("alice@example.com");
  expect(maskStudioText("Bearer eyJabcdef.eyJabcdef.signature")).not.toContain("eyJabcdef");
});
it("sanitizes link credentials and query parameters without mutating the draft", () => {
  const draft = fixture();
  const input = {
    ...draft,
    input: { ...draft.input, links: ["https://name:secret@example.com/docs?api_key=foo#private"] },
  };
  const clean = sanitizeStudioDraft(input);
  expect(clean.input.links).toEqual(["https://example.com/docs"]);
  expect(input.input.links[0]).toContain("secret");
});
