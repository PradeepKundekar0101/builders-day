import { randomUUID } from "node:crypto";
import { beforeAll, describe, expect, test } from "vitest";
import {
  anonClient,
  createUserClient,
  IDEA_TEXT,
  seedOwnedRows,
  serviceClient,
  type Client,
  type SeededIds,
} from "./helpers";

let owner: { client: Client; userId: string };
let other: { client: Client; userId: string };
let ids: SeededIds;

beforeAll(async () => {
  owner = await createUserClient("owner");
  other = await createUserClient("other");
  ids = await seedOwnedRows(owner.userId);
});

const ownerScoped = [
  { table: "ideas", key: "ideaId" },
  { table: "intake_messages", key: "ideaId", column: "idea_id" },
  { table: "specs", key: "specId" },
  { table: "quotes", key: "quoteId" },
  { table: "payments", key: "quoteId", column: "quote_id" },
  { table: "builds", key: "buildId" },
  { table: "build_events", key: "buildId", column: "build_id" },
  { table: "deployments", key: "deploymentId", select: "id" },
  { table: "audits", key: "deploymentId", column: "deployment_id" },
] as const;

describe("profiles", () => {
  test('profile is created with role "user" on sign-up', async () => {
    const { data, error } = await owner.client.from("profiles").select("id, role");
    expect(error).toBeNull();
    expect(data).toEqual([{ id: owner.userId, role: "user" }]);
  });

  test("user cannot update own profile role", async () => {
    await owner.client.from("profiles").update({ role: "admin" }).eq("id", owner.userId);
    const { data } = await serviceClient()
      .from("profiles")
      .select("role")
      .eq("id", owner.userId)
      .single();
    expect(data?.role).toBe("user");
  });
});

describe("owner-scoped tables", () => {
  test.each(ownerScoped)(
    "$table: owner sees 1 row, other user sees 0, anon sees 0",
    async ({ table, key, ...rest }) => {
      const column = "column" in rest ? rest.column : "id";
      const select = "select" in rest ? rest.select : "*";
      const read = (c: Client) => c.from(table).select(select).filter(column, "eq", ids[key]);

      const mine = await read(owner.client);
      expect(mine.error).toBeNull();
      expect(mine.data).toHaveLength(1);

      const theirs = await read(other.client);
      expect(theirs.error).toBeNull();
      expect(theirs.data).toHaveLength(0);

      const anon = await read(anonClient());
      expect(anon.data ?? []).toHaveLength(0);
    },
  );
});

describe("staff-only tables", () => {
  test("approvals and supabase_pool are invisible to a normal user", async () => {
    await serviceClient()
      .from("supabase_pool")
      .insert({
        project_ref: `ref-${randomUUID()}`,
        api_url: "https://x.supabase.co",
        anon_key: "anon",
        service_key_secret_ref: "vault:x",
      });
    const approvals = await owner.client.from("approvals").select("id");
    expect(approvals.data).toEqual([]);
    const pool = await owner.client.from("supabase_pool").select("project_ref");
    expect(pool.data).toEqual([]);
  });

  test("staff sees other users' ideas and approvals", async () => {
    const staff = await createUserClient("operator");
    await serviceClient().from("profiles").update({ role: "operator" }).eq("id", staff.userId);
    const ideas = await staff.client.from("ideas").select("id").eq("id", ids.ideaId);
    expect(ideas.data).toHaveLength(1);
    const approvals = await staff.client.from("approvals").select("id").eq("id", ids.approvalId);
    expect(approvals.data).toHaveLength(1);
  });
});

describe("writes", () => {
  test("user cannot insert an idea", async () => {
    const { error } = await owner.client
      .from("ideas")
      .insert({ user_id: owner.userId, text: IDEA_TEXT });
    expect(error).not.toBeNull();
    const { count } = await serviceClient()
      .from("ideas")
      .select("id", { count: "exact", head: true })
      .eq("user_id", owner.userId);
    expect(count).toBe(1);
  });

  test.each([49, 2001])("idea text of %i chars is rejected", async (length) => {
    const { error } = await serviceClient()
      .from("ideas")
      .insert({ user_id: owner.userId, text: "x".repeat(length) });
    expect(error?.code).toBe("23514");
  });

  test.each([50, 2000])("idea text of %i chars is accepted", async (length) => {
    const { error } = await serviceClient()
      .from("ideas")
      .insert({ user_id: other.userId, text: "x".repeat(length) });
    expect(error).toBeNull();
  });

  test("duplicate payments.provider_order_id is rejected", async () => {
    const row = {
      quote_id: ids.quoteId,
      user_id: owner.userId,
      provider: "fake",
      provider_order_id: `dup-${randomUUID()}`,
      amount_minor: 100,
      currency: "INR",
    };
    expect((await serviceClient().from("payments").insert(row)).error).toBeNull();
    expect((await serviceClient().from("payments").insert(row)).error?.code).toBe("23505");
  });
});

describe("deployment url", () => {
  test("selecting deployments.url as owner fails with permission denied", async () => {
    const { error } = await owner.client
      .from("deployments")
      .select("url")
      .eq("id", ids.deploymentId);
    expect(error?.code).toBe("42501");
  });

  test("selecting deployments.id as owner succeeds", async () => {
    const { data, error } = await owner.client
      .from("deployments")
      .select("id")
      .eq("id", ids.deploymentId);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  test("released_url is null before release, the url after, and null for another user", async () => {
    const before = await owner.client.rpc("released_url", { p_build_id: ids.buildId });
    expect(before.error).toBeNull();
    expect(before.data).toBeNull();

    await serviceClient().from("builds").update({ status: "released" }).eq("id", ids.buildId);

    const after = await owner.client.rpc("released_url", { p_build_id: ids.buildId });
    expect(after.data).toBe("https://secret.example");

    const stranger = await other.client.rpc("released_url", { p_build_id: ids.buildId });
    expect(stranger.data).toBeNull();
  });
});
