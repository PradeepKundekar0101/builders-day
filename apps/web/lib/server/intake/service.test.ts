import { describe, expect, test } from "vitest";
import { MemoryIntakeRepo } from "./memory-repo";
import { IntakeError, IntakeService } from "./service";

const IDEA = "A tiffin order tracker where my customers place orders and pay online each week.";

const spec = {
  name: "Tiffin tracker",
  summary: "Weekly tiffin orders",
  pages: [
    { name: "Home", purpose: "Landing", mustHave: true },
    { name: "Menu", purpose: "This week", mustHave: true },
  ],
  entities: ["order", "customer", "menu_item"].map((name) => ({
    name,
    ownerScoped: true,
    mustHave: true,
    fields: [{ name: "title", type: "text", required: true }],
  })),
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
};

function setup() {
  const repo = new MemoryIntakeRepo();
  const service = new IntakeService(repo);
  return { repo, service };
}

describe("IntakeService", () => {
  test("submitting an idea masks personal data before storing it", async () => {
    const { repo, service } = setup();
    const idea = await service.submitIdea("u1", `${IDEA} Reach me at asha@x.in.`, []);
    expect(repo.ideas.get(idea.id)?.text).toContain("{{PII_EMAIL_1}}");
    expect(repo.ideas.get(idea.id)?.text).not.toContain("asha@x.in");
    expect(repo.ideas.get(idea.id)?.maskMap).toEqual({ "{{PII_EMAIL_1}}": "asha@x.in" });
  });

  test.each([49, 2001])("rejects idea text of %i chars", async (length) => {
    const { service } = setup();
    await expect(service.submitIdea("u1", "x".repeat(length), [])).rejects.toThrow(IntakeError);
  });

  test("the agent may ask at most 4 questions", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    for (let i = 1; i <= 4; i++) await service.askQuestion(idea.id, `Question ${i}?`);
    await expect(service.askQuestion(idea.id, "Fifth?")).rejects.toMatchObject({
      code: "question_limit",
    });
  });

  test("questions are masked too", async () => {
    const { repo, service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await service.askQuestion(idea.id, "Is 9876543210 your number?");
    expect(repo.messages.at(-1)?.content).toBe("Is {{PII_PHONE_1}} your number?");
  });

  test("only the idea's owner can answer", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await service.askQuestion(idea.id, "Who orders?");
    await expect(service.answer("u2", idea.id, "Me")).rejects.toMatchObject({ code: "not_found" });
    await service.answer("u1", idea.id, "Office workers");
  });

  test("an invalid spec is rejected with readable issues", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await expect(service.submitSpec(idea.id, { ...spec, pages: [] })).rejects.toMatchObject({
      code: "invalid_spec",
    });
  });

  test("a clean spec gets a draft quote with the default selection and no approval", async () => {
    const { repo, service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    const result = await service.submitSpec(idea.id, spec);
    expect(result.flagReasons).toEqual([]);
    expect(result.quote).toMatchObject({ costUsd: 4, hours: 3.25, status: "draft" });
    expect(repo.approvals).toEqual([]);
    expect(repo.ideas.get(idea.id)?.status).toBe("spec_ready");
  });

  test("a payment spec is held for an operator", async () => {
    const { repo, service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    const withPayment = { ...spec, integrations: [{ kind: "payment_pinelabs", mustHave: true }] };
    const result = await service.submitSpec(idea.id, withPayment);
    expect(result.flagReasons).toEqual(["payment"]);
    expect(repo.approvals).toHaveLength(1);
    expect(repo.specs.get(result.specId)?.operatorStatus).toBe("pending");
  });

  test("updating the selection recomputes the quote on the server", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    const { quote } = await service.submitSpec(idea.id, {
      ...spec,
      pages: spec.pages.map((p, i) => ({ ...p, mustHave: i === 0 })),
      entities: spec.entities.map((e, i) => ({ ...e, mustHave: i === 0 })),
    });
    const updated = await service.updateSelection("u1", quote.id, {
      pages: ["Home"],
      entities: ["order"],
      auth: true,
      integrations: [],
    });
    expect(updated).toMatchObject({ costUsd: 2.38, costCredits: 238, hours: 1.5 });
    await expect(
      service.updateSelection("u1", quote.id, {
        pages: ["Home"],
        entities: ["order"],
        auth: false,
        integrations: [],
      }),
    ).rejects.toThrow();
    await expect(
      service.updateSelection("u1", quote.id, {
        pages: [],
        entities: ["order"],
        auth: true,
        integrations: [],
      }),
    ).rejects.toMatchObject({
      code: "invalid_selection",
      message: expect.stringContaining("Required feature"),
    });
    await expect(
      service.updateSelection("u2", quote.id, {
        pages: [],
        entities: [],
        auth: false,
        integrations: [],
      }),
    ).rejects.toMatchObject({ code: "not_found" });
  });

  test("an answer needs an open question", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await expect(service.answer("u1", idea.id, "Unprompted")).rejects.toMatchObject({
      code: "wrong_state",
    });
    await service.askQuestion(idea.id, "Who orders?");
    await service.answer("u1", idea.id, "Office workers");
    await expect(service.answer("u1", idea.id, "Again")).rejects.toMatchObject({
      code: "wrong_state",
    });
  });

  test("the agent reads only answers after its question, still masked", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await service.askQuestion(idea.id, "Who orders?");
    await service.answer("u1", idea.id, "Office workers");
    const second = await service.askQuestion(idea.id, "How do they pay?");
    expect(await service.answersAfter(idea.id, second.id)).toEqual([]);
    await service.answer("u1", idea.id, "UPI to asha@x.in");
    expect(await service.answersAfter(idea.id, second.id)).toEqual([
      { id: expect.any(String), content: "UPI to {{PII_EMAIL_1}}" },
    ]);
  });

  test("the agent sees submitted ideas masked", async () => {
    const { service } = setup();
    await service.submitIdea("u1", `${IDEA} Mail asha@x.in.`, ["https://example.com"]);
    const ideas = await service.listSubmittedIdeas();
    expect(ideas).toHaveLength(1);
    expect(ideas[0]!.text).toContain("{{PII_EMAIL_1}}");
    expect(ideas[0]!.links).toEqual(["https://example.com"]);
  });

  test("the owner's view unmasks text and shows the estimate", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", `${IDEA} Mail asha@x.in.`, []);
    await service.askQuestion(idea.id, "Is asha@x.in the contact?");
    let view = await service.ideaView("u1", idea.id);
    expect(view.text).toContain("asha@x.in");
    expect(view.messages[0]!.content).toBe("Is asha@x.in the contact?");
    expect(view.awaitingAnswer).toBe(true);
    expect(view.estimate).toBeNull();

    await service.answer("u1", idea.id, "Yes");
    await service.submitSpec(idea.id, spec);
    view = await service.ideaView("u1", idea.id);
    expect(view.awaitingAnswer).toBe(false);
    expect(view.review).toBe("not_needed");
    expect(view.estimate).toMatchObject({
      quote: { costUsd: 4 },
      spec: { name: "Tiffin tracker" },
    });
    await expect(service.ideaView("u2", idea.id)).rejects.toMatchObject({ code: "not_found" });
  });

  test("a held spec hides the price until an operator approves it", async () => {
    const { repo, service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await service.submitSpec(idea.id, {
      ...spec,
      integrations: [{ kind: "payment_pinelabs", mustHave: true }],
    });
    let view = await service.ideaView("u1", idea.id);
    expect(view.review).toBe("pending");
    expect(view.estimate).toBeNull();

    const [approval] = await service.pendingApprovals();
    expect(approval).toMatchObject({ ideaId: idea.id, flagReasons: ["payment"] });
    await service.decide("staff-1", approval!.id, "approved");
    view = await service.ideaView("u1", idea.id);
    expect(view.review).toBe("approved");
    expect(view.estimate).not.toBeNull();
    await expect(service.decide("staff-1", approval!.id, "rejected")).rejects.toMatchObject({
      code: "not_found",
    });
    expect(repo.approvals[0]!.decision).toBe("approved");
  });

  test("a rejected spec never shows a price", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    await service.submitSpec(idea.id, {
      ...spec,
      integrations: [{ kind: "payment_pinelabs", mustHave: true }],
    });
    const [approval] = await service.pendingApprovals();
    await service.decide("staff-1", approval!.id, "rejected");
    const view = await service.ideaView("u1", idea.id);
    expect(view.review).toBe("rejected");
    expect(view.estimate).toBeNull();
  });

  test("a held quote cannot be changed until approved", async () => {
    const { service } = setup();
    const idea = await service.submitIdea("u1", IDEA, []);
    const { quote } = await service.submitSpec(idea.id, {
      ...spec,
      integrations: [{ kind: "payment_pinelabs", mustHave: true }],
    });
    await expect(
      service.updateSelection("u1", quote.id, {
        pages: [],
        entities: [],
        auth: false,
        integrations: [],
      }),
    ).rejects.toMatchObject({ code: "wrong_state" });
  });

  test("the founder's list shows their own ideas, newest first, unmasked", async () => {
    const { service } = setup();
    const first = await service.submitIdea("u1", `Contact asha@x.in. ${IDEA}`, []);
    const second = await service.submitIdea("u1", IDEA, []);
    await service.submitSpec(second.id, spec);
    await service.submitIdea("u2", IDEA, []);

    const list = await service.listIdeas("u1");
    expect(list.map((item) => item.id)).toEqual([second.id, first.id]);
    expect(list[0]).toMatchObject({ title: "Tiffin tracker", status: "spec_ready", costUsd: 4 });
    expect(list[1]!.title).toContain("asha@x.in");
    expect(list[1]!.title.length).toBeLessThanOrEqual(80);
    expect(list[1]).toMatchObject({ status: "submitted", costUsd: null });
  });

  test("the operator queue skips approvals whose spec is gone", async () => {
    const { repo, service } = setup();
    await repo.createApproval({ kind: "flagged_spec", subjectId: "missing-spec" });
    expect(await service.pendingApprovals()).toEqual([]);
  });
});
