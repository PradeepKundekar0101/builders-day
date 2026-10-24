import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import { anonClient, createUserClient, IDEA_TEXT, serviceClient, type Client } from "./helpers";

let owner: { client: Client; userId: string };

beforeAll(async () => {
  owner = await createUserClient("intake");
});

async function newIdea(userId: string) {
  const { data, error } = await serviceClient()
    .from("ideas")
    .insert({ user_id: userId, text: IDEA_TEXT, mask_map_enc: "sealed" })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

describe("claim_question_slot", () => {
  test("hands out exactly four slots per idea", async () => {
    const ideaId = await newIdea(owner.userId);
    const results: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      const { data, error } = await serviceClient().rpc("claim_question_slot", {
        p_idea_id: ideaId,
      });
      expect(error).toBeNull();
      results.push(data as boolean);
    }
    expect(results).toEqual([true, true, true, true, false]);
  });

  test("concurrent claims never exceed four", async () => {
    const ideaId = await newIdea(owner.userId);
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        serviceClient().rpc("claim_question_slot", { p_idea_id: ideaId }),
      ),
    );
    expect(results.filter((r) => r.data === true)).toHaveLength(4);
  });

  test("users cannot call it", async () => {
    const ideaId = await newIdea(owner.userId);
    const { error } = await owner.client.rpc("claim_question_slot", { p_idea_id: ideaId });
    expect(error?.code).toBe("42501");
  });
});

describe("ideas.mask_map_enc", () => {
  test("is hidden from the owner", async () => {
    await newIdea(owner.userId);
    const { error } = await owner.client.from("ideas").select("mask_map_enc");
    expect(error?.code).toBe("42501");
    const visible = await owner.client.from("ideas").select("id, text, status, question_count");
    expect(visible.error).toBeNull();
    expect(visible.data?.length).toBeGreaterThan(0);
  });
});

describe("intake_messages.kind", () => {
  test("accepts question and answer, rejects anything else", async () => {
    const ideaId = await newIdea(owner.userId);
    const db = serviceClient();
    const ok = await db
      .from("intake_messages")
      .insert({ idea_id: ideaId, role: "agent", kind: "question", content: "Who orders?" });
    expect(ok.error).toBeNull();
    const bad = await db
      .from("intake_messages")
      .insert({ idea_id: ideaId, role: "agent", kind: "shout", content: "Hey" });
    expect(bad.error?.code).toBe("23514");
  });
});

describe("shared_estimate", () => {
  async function seedQuote(spec: object) {
    const db = serviceClient();
    const ideaId = await newIdea(owner.userId);
    const specRow = await db
      .from("specs")
      .insert({ idea_id: ideaId, user_id: owner.userId, spec })
      .select("id")
      .single();
    const slug = randomUUID();
    await db.from("quotes").insert({
      spec_id: specRow.data!.id,
      user_id: owner.userId,
      selected_features: { pages: ["Home"], entities: [], auth: true, integrations: [] },
      cost_usd: 4.96,
      low_usd: 3.47,
      high_usd: 6.45,
      hours: 4.25,
      model_budget_usd: 1.98,
      weights_version: "v1",
      share_slug: slug,
    });
    return slug;
  }

  test("returns only the headline to anyone with the link", async () => {
    const slug = await seedQuote({
      name: "Tiffin tracker",
      summary: "Weekly orders",
      pages: [{ name: "Home", purpose: "x", mustHave: true }],
    });
    const { data, error } = await anonClient().rpc("shared_estimate", { p_slug: slug });
    expect(error).toBeNull();
    expect(data).toEqual({
      name: "Tiffin tracker",
      summary: "Weekly orders",
      cost_usd: 4.96,
      low_usd: 3.47,
      high_usd: 6.45,
      hours: 4.25,
    });
  });

  test("returns null for an unknown slug", async () => {
    const { data, error } = await anonClient().rpc("shared_estimate", { p_slug: "nope" });
    expect(error).toBeNull();
    expect(data).toBeNull();
  });

  test("anon still cannot read quotes directly", async () => {
    const { data } = await anonClient().from("quotes").select("id");
    expect(data ?? []).toEqual([]);
  });
});
