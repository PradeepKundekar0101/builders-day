import { randomBytes, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, test } from "vitest";
import type { Database } from "@buildwise/db";
import { IntakeService } from "./service";
import { SupabaseIntakeRepo } from "./supabase-repo";

const IDEA = "A tiffin order tracker where my customers place orders and pay online each week.";

const spec = {
  name: "Tiffin tracker",
  summary: "Weekly tiffin orders",
  pages: [{ name: "Home", purpose: "Landing", mustHave: true }],
  entities: [
    {
      name: "order",
      ownerScoped: true,
      mustHave: true,
      fields: [{ name: "item", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [{ kind: "payment_pinelabs", mustHave: true }],
};

const db = createClient<Database>(
  process.env.SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const repo = new SupabaseIntakeRepo(db, randomBytes(32).toString("base64"));
const service = new IntakeService(repo);
let userId: string;

beforeAll(async () => {
  const { data, error } = await db.auth.admin.createUser({
    email: `repo-${randomUUID()}@test.buildwise.local`,
    email_confirm: true,
  });
  if (error) throw error;
  userId = data.user.id;
});

describe("SupabaseIntakeRepo through IntakeService", () => {
  test("full intake: masked storage, four-question cap, held spec, approval", async () => {
    const idea = await service.submitIdea(userId, `${IDEA} Mail asha@x.in.`, []);

    const stored = await db.from("ideas").select("text, mask_map_enc").eq("id", idea.id).single();
    expect(stored.data?.text).toContain("{{PII_EMAIL_1}}");
    expect(stored.data?.mask_map_enc).not.toContain("asha");

    const asked = await service.askQuestion(idea.id, "Who orders?");
    await service.answer(userId, idea.id, "Office workers, contact asha@x.in");
    expect(await service.answersAfter(idea.id, asked.id)).toEqual([
      { id: expect.any(String), content: "Office workers, contact {{PII_EMAIL_1}}" },
    ]);
    for (let i = 0; i < 3; i++) {
      await service.askQuestion(idea.id, `Question ${i}?`);
      await service.answer(userId, idea.id, "ok");
    }
    await expect(service.askQuestion(idea.id, "Fifth?")).rejects.toMatchObject({
      code: "question_limit",
    });

    const result = await service.submitSpec(idea.id, spec);
    expect(result.flagReasons).toEqual(["payment"]);
    await expect(service.submitSpec(idea.id, spec)).rejects.toMatchObject({ code: "wrong_state" });

    let view = await service.ideaView(userId, idea.id);
    expect(view.text).toContain("asha@x.in");
    expect(view.messages).toHaveLength(8);
    expect(view.review).toBe("pending");
    expect(view.estimate).toBeNull();

    const approval = (await service.pendingApprovals()).find((a) => a.ideaId === idea.id);
    expect(approval).toMatchObject({ specName: "Tiffin tracker", costUsd: 3.34 });
    await service.decide(userId, approval!.id, "approved");
    view = await service.ideaView(userId, idea.id);
    expect(view.estimate?.quote).toMatchObject({ costUsd: 3.34, status: "draft" });

    const updated = await service.updateSelection(userId, view.estimate!.quote.id, {
      pages: ["Home"],
      entities: [],
      auth: false,
      integrations: [],
    });
    expect(updated.costUsd).toBe(1.18);
  });

  test("one unreadable mask map does not block the agent's queue", async () => {
    const broken = await db
      .from("ideas")
      .insert({ user_id: userId, text: IDEA, mask_map_enc: "not-a-sealed-value" })
      .select("id")
      .single();
    const good = await service.submitIdea(userId, `${IDEA} Mail asha@x.in.`, []);

    const ids = (await service.listSubmittedIdeas()).map((idea) => idea.id);
    expect(ids).not.toContain(broken.data!.id);
    const status = await db.from("ideas").select("status").eq("id", broken.data!.id).single();
    expect(status.data?.status).toBe("failed");
    // Earlier broken rows are now out of the queue, so a fresh idea is always reachable.
    expect((await service.listSubmittedIdeas()).map((idea) => idea.id)).toContain(good.id);
  });
});
