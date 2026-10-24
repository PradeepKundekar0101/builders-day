import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import {
  CreditWallet,
  PostgresWalletStore,
  CostGuard,
  PostgresStore,
  creditsToUnits,
  type RpcClient,
} from "./index";
const owner = "00000000-0000-4000-8000-000000000001",
  staff = "00000000-0000-4000-8000-000000000002",
  spec = "00000000-0000-4000-8000-000000000004";
let db: PGlite;
const client: RpcClient = {
  async rpc(name, args) {
    try {
      const wallet = name.startsWith("cost_wallet"),
        read = name.endsWith("read");
      const params = [
        wallet ? args.p_account_id : args.p_build_id,
        ...(read
          ? []
          : [
              args.p_expected_version,
              JSON.stringify(args.p_state),
              JSON.stringify(args.p_command),
            ]),
      ];
      const { rows } = await db.query<{ result: unknown }>(
        `select public.${name}(${read ? "$1" : "$1,$2,$3,$4"}) as result`,
        params,
      );
      return { data: rows[0]?.result, error: null };
    } catch (error) {
      return { data: null, error: { message: String(error) } };
    }
  },
};
const wallet = new CreditWallet(new PostgresWalletStore(client)),
  guard = new CostGuard(new PostgresStore(client));
beforeAll(async () => {
  db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create role service_role;create schema auth;create table auth.users(id uuid primary key,email text);create function auth.uid() returns uuid language sql as $$ select null::uuid $$;`,
  );
  for (const file of [
    "20261024000000_init.sql",
    "20261024000100_hardening.sql",
    "20261024011000_cost_guard.sql",
    "20261024021000_credit_wallet.sql",
  ]) {
    const sql = await readFile(
      new URL(`../../../supabase/migrations/${file}`, import.meta.url),
      "utf8",
    );
    await db.exec(
      sql.replace("alter publication supabase_realtime add table public.build_events;", ""),
    );
  }
  await db.exec(
    `insert into auth.users(id,email) values ('${owner}','owner@example.test'),('${staff}','staff@example.test');update public.profiles set role='operator' where id='${staff}';insert into public.ideas(id,user_id,text) values('00000000-0000-4000-8000-000000000003','${owner}','A booking application with appointment scheduling and customer management.');insert into public.specs(id,idea_id,user_id,spec) values('${spec}','00000000-0000-4000-8000-000000000003','${owner}','{}');`,
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
async function quote(id: string, amount = 200) {
  await db.query(
    "insert into public.quotes(id,spec_id,user_id,cost_usd,low_usd,high_usd,hours,model_budget_usd,weights_version,share_slug,status,spec_revision) values($1::uuid,$2,$3,$4,1,3,1,1,'v1',$1::text,'locked','rev1')",
    [id, spec, owner, amount / 100],
  );
  await wallet.execute(owner, {
    type: "quote",
    id: `quote:${id}`,
    runId: id,
    quoteId: id,
    specRevision: "rev1",
    category: "build",
    capUnits: creditsToUnits(amount),
  });
  await wallet.execute(owner, {
    type: "approve",
    id: `approve:${id}`,
    runId: id,
    capUnits: creditsToUnits(amount),
    actorId: owner,
  });
}
it("locks down wallet RPCs and tables", async () => {
  const { rows } = await db.query<{ allowed: boolean }>(
    "select has_function_privilege('authenticated','public.cost_wallet_cas(uuid,bigint,jsonb,jsonb)','execute') as allowed",
  );
  expect(rows[0]?.allowed).toBe(false);
  await db.exec("set role authenticated");
  await expect(db.exec("select * from public.cost_wallet_accounts")).rejects.toThrow();
  await db.exec("reset role");
});
it("atomically funds only one competing run and creates its build", async () => {
  await wallet.execute(owner, {
    type: "allowance",
    id: "monthly",
    plan: "free",
    period: "2026-10",
  });
  const a = "00000000-0000-4000-8000-000000000010",
    b = "00000000-0000-4000-8000-000000000011";
  await quote(a);
  await quote(b);
  const outcomes = await Promise.all(
    [a, b].map((runId) => wallet.execute(owner, { type: "start", id: `start:${runId}`, runId })),
  );
  expect(outcomes.filter((o) => o.allowed)).toHaveLength(1);
  expect(
    (await new CreditWallet(new PostgresWalletStore(client)).status(owner)).availableCredits,
  ).toBe(100);
  const { rows } = await db.query<{ id: string }>("select id from public.builds");
  expect(rows).toHaveLength(1);
  const runId = rows[0]!.id;
  expect(
    (await wallet.execute(owner, { type: "start", id: "duplicate-start", runId })).allowed,
  ).toBe(false);
  await expect(
    db.query("update public.quotes set cost_usd=0 where id=$1", [runId]),
  ).rejects.toThrow("immutable");
  await expect(
    guard.execute(runId, {
      type: "reserve",
      id: "before-attempt",
      taskId: "test",
      maxMicros: 100000,
    }),
  ).rejects.toThrow("Active wallet attempt required");
  await wallet.execute(owner, {
    type: "beginAttempt",
    id: "attempt-1",
    runId,
    attemptId: "attempt-1",
  });
  await guard.execute(runId, { type: "reserve", id: "call", taskId: "test", maxMicros: 900000 });
  await guard.execute(runId, { type: "start", id: "call" });
  await wallet.execute(owner, {
    type: "reportAttempt",
    id: "report-1",
    runId,
    attemptId: "attempt-1",
    success: false,
    failureFingerprint: "same-error",
  });
  await expect(
    wallet.execute(owner, {
      type: "finish",
      id: "premature",
      runId,
      outcome: "platform_failure",
      chargeUnits: 0,
      evidenceRef: "proof",
    }),
  ).rejects.toThrow("Provider usage must be settled");
  await guard.execute(runId, {
    type: "reconcile",
    id: "call",
    actualMicros: 650000,
    inputTokens: 1,
    outputTokens: 1,
    pricingVersion: "v1",
  });
  await wallet.execute(owner, {
    type: "beginAttempt",
    id: "attempt-2",
    runId,
    attemptId: "attempt-2",
  });
  await wallet.execute(owner, {
    type: "reportAttempt",
    id: "report-2",
    runId,
    attemptId: "attempt-2",
    success: false,
    failureFingerprint: "same-error",
  });
  await expect(
    guard.execute(runId, { type: "reserve", id: "paused-call", taskId: "test", maxMicros: 100000 }),
  ).rejects.toThrow("Active wallet attempt required");
  await expect(
    guard.execute(runId, {
      type: "approve",
      id: "bypass-cap",
      actorId: owner,
      newCapMicros: 2000000,
    }),
  ).rejects.toThrow("new quote");
  await wallet.execute(owner, {
    type: "finish",
    id: "failure",
    runId,
    outcome: "platform_failure",
    chargeUnits: 0,
    evidenceRef: "verified-platform-fault",
  });
  expect((await wallet.status(owner)).availableCredits).toBe(300);
  expect((await guard.status(runId)).spentMicros).toBe(650000);
  await expect(
    guard.execute(runId, {
      type: "reserve",
      id: "finished-call",
      taskId: "test",
      maxMicros: 100000,
    }),
  ).rejects.toThrow("Active wallet attempt required");
});
it("refunds charged credits once with staff attribution and deduplicates payment IDs", async () => {
  await wallet.execute(owner, {
    type: "topup",
    id: "pay1",
    paymentRef: "verified-payment",
    units: creditsToUnits(100),
  });
  expect(
    (
      await wallet.execute(owner, {
        type: "topup",
        id: "pay2",
        paymentRef: "verified-payment",
        units: creditsToUnits(100),
      })
    ).replayed,
  ).toBe(true);
  const runId = "00000000-0000-4000-8000-000000000012";
  await quote(runId, 100);
  await wallet.execute(owner, { type: "start", id: "start-charge", runId });
  await wallet.execute(owner, {
    type: "finish",
    id: "charge",
    runId,
    outcome: "success",
    chargeUnits: creditsToUnits(100),
  });
  const refund = {
    type: "refund" as const,
    id: "refund-owner",
    runId,
    cause: "platform" as const,
    evidenceRef: "support-evidence",
    actorId: owner,
  };
  await expect(wallet.execute(owner, refund)).rejects.toThrow("staff");
  await wallet.execute(owner, { ...refund, id: "refund-staff", actorId: staff });
  await wallet.execute(owner, { ...refund, id: "refund-staff-again", actorId: staff });
  expect((await wallet.status(owner)).refundedCredits).toBe(100);
  expect((await wallet.status(owner)).availableCredits).toBe(400);
});
it("rejects a mismatched locked quote without consuming credits", async () => {
  const runId = "00000000-0000-4000-8000-000000000013";
  await quote(runId, 100);
  const before = await wallet.status(owner);
  await db.query("update public.specs set operator_status='pending' where id=$1", [spec]);
  await expect(wallet.execute(owner, { type: "start", id: "blocked-spec", runId })).rejects.toThrow(
    "Operator review",
  );
  expect((await wallet.status(owner)).availableCredits).toBe(before.availableCredits);
});
