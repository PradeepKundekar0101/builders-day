import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import { CostGuard, PostgresStore, type RpcClient } from "./index";
const owner = "00000000-0000-4000-8000-000000000001",
  stranger = "00000000-0000-4000-8000-000000000002";
const buildId = "00000000-0000-4000-8000-000000000010";
let db: PGlite;
const client: RpcClient = {
  async rpc(name, args) {
    try {
      let rows: { result: unknown }[];
      if (name === "cost_guard_read")
        ({ rows } = await db.query<{ result: unknown }>(
          "select public.cost_guard_read($1) as result",
          [args.p_build_id],
        ));
      else
        ({ rows } = await db.query<{ result: unknown }>(
          "select public.cost_guard_cas($1,$2,$3,$4) as result",
          [
            args.p_build_id,
            args.p_expected_version,
            JSON.stringify(args.p_state),
            JSON.stringify(args.p_command),
          ],
        ));
      return { data: rows[0]?.result, error: null };
    } catch (error) {
      return { data: null, error: { message: String(error) } };
    }
  },
};
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`,
  );
  const base = await readFile(
    new URL("../../../supabase/migrations/20261024000000_init.sql", import.meta.url),
    "utf8",
  );
  await db.exec(
    base.replace("alter publication supabase_realtime add table public.build_events;", ""),
  );
  await db.exec(
    await readFile(
      new URL("../../../supabase/migrations/20261024011000_cost_guard.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query(
    "insert into auth.users(id,email) values ($1,'owner@example.test'),($2,'other@example.test')",
    [owner, stranger],
  );
  await db.exec(`insert into public.ideas(id,user_id,text) values ('00000000-0000-4000-8000-000000000003','${owner}','A booking application with appointment scheduling and customer management.');
 insert into public.specs(id,idea_id,user_id,spec) values ('00000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000003','${owner}','{}');
 insert into public.quotes(id,spec_id,user_id,cost_usd,low_usd,high_usd,hours,model_budget_usd,weights_version,share_slug,status) values ('00000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000004','${owner}',3,2,4,1,1,'v1','test','paid');
 insert into public.builds(id,quote_id,user_id,budget_usd) values ('${buildId}','00000000-0000-4000-8000-000000000005','${owner}',1);`);
}, 30000);
afterAll(async () => {
  await db.close();
});
it("enforces a service-role-only RPC boundary and immutable pricing", async () => {
  const { rows } = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('authenticated','public.cost_guard_cas(uuid,bigint,jsonb,jsonb)','execute') as allowed",
  );
  expect(rows[0]?.allowed).toBe(false);
  await expect(
    db.exec("update public.cost_pricing_versions set config='{}' where version='v1'"),
  ).rejects.toThrow("immutable");
});
it("persists reservations, serializes contention, recovers and records precise approval", async () => {
  const guard = new CostGuard(new PostgresStore(client));
  const results = await Promise.all(
    ["a", "b"].map((id) =>
      guard.execute(buildId, { type: "reserve", id, taskId: "test", maxMicros: 800000 }),
    ),
  );
  expect(results.filter((r) => r.allowed)).toHaveLength(1);
  const recovered = new CostGuard(new PostgresStore(client));
  expect((await recovered.status(buildId)).reservedMicros).toBe(800000);
  const { rows } = await db.query<{ state: { reservations: { id: string }[] } }>(
    "select state from public.cost_guard_accounts where build_id=$1",
    [buildId],
  );
  const id = rows[0]!.state.reservations[0]!.id;
  await recovered.execute(buildId, { type: "start", id });
  const usage = {
    type: "reconcile" as const,
    id,
    actualMicros: 500001,
    inputTokens: 10,
    outputTokens: 20,
    pricingVersion: "fixture",
  };
  await recovered.execute(buildId, usage);
  await recovered.execute(buildId, usage);
  await expect(
    recovered.execute(buildId, {
      type: "approve",
      id: "bad-approval",
      actorId: stranger,
      newCapMicros: 2000000,
    }),
  ).rejects.toThrow("Unauthorized");
  await recovered.execute(buildId, {
    type: "approve",
    id: "approval",
    actorId: owner,
    newCapMicros: 2000000,
  });
  const build = await db.query<{ spent_usd: string; tokens_in: number }>(
    "select spent_usd,tokens_in from public.builds where id=$1",
    [buildId],
  );
  expect(Number(build.rows[0]!.spent_usd)).toBe(0.500001);
  expect(Number(build.rows[0]!.tokens_in)).toBe(10);
  expect((await recovered.status(buildId)).capMicros).toBe(2000000);
  const approvals = await db.query(
    "select id from public.approvals where subject_id=$1 and decision='approved'",
    [buildId],
  );
  expect(approvals.rows.length).toBeGreaterThan(0);
});
