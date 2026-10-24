import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { beforeAll, beforeEach, afterAll, expect, it } from "vitest";
import {
  initialWallet,
  walletTransition,
  walletStatus,
  type WalletState,
} from "@buildwise/cost-guard";
const db = new PGlite();
const buyer = "11111111-1111-4111-8111-111111111111",
  staff = "22222222-2222-4222-8222-222222222222",
  other = "33333333-3333-4333-8333-333333333333",
  id = "44444444-4444-4444-8444-444444444444",
  second = "55555555-5555-4555-8555-555555555555";
const migration = (name: string) =>
  readFileSync(new URL(`../../../../supabase/migrations/${name}`, import.meta.url), "utf8");
beforeAll(async () => {
  await db.exec(
    "create schema auth; create table auth.users(id uuid primary key); create table public.profiles(id uuid primary key,role text); create role anon; create role authenticated; create role service_role;",
  );
  const wallet = migration("20261024021000_credit_wallet.sql");
  await db.exec(wallet.slice(0, wallet.indexOf("alter table public.quotes")));
  await db.exec(
    wallet.slice(
      wallet.indexOf("create function public.cost_wallet_read"),
      wallet.indexOf("create function public.cost_wallet_cas"),
    ),
  );
  await db.exec(migration("20261024041000_manual_upi.sql"));
  await db.exec(migration("20261024042000_manual_payment_build_context.sql"));
  await db.query("insert into auth.users values ($1),($2),($3)", [buyer, staff, other]);
  await db.query("insert into profiles values ($1,'user'),($2,'admin'),($3,'user')", [
    buyer,
    staff,
    other,
  ]);
}, 20000);
beforeEach(async () => {
  await db.exec(
    "truncate manual_credit_payments,cost_wallet_accounts,cost_wallet_journal restart identity",
  );
});
afterAll(async () => {
  await db.close();
});
async function purchase(payment = id, account = buyer) {
  await db.query(
    "insert into manual_credit_payments(id,account_id,credits,build_session,build_revision) values($1,$2,100,$3,2)",
    [payment, account, buyer],
  );
}
async function review(
  payment = id,
  actor = staff,
  approve = true,
  reference: string | null = "123456789012",
) {
  return db.query("select review_manual_credit_payment($1,$2,$3,$4) as status", [
    payment,
    actor,
    approve,
    reference,
  ]);
}
async function wallet() {
  return (await db.query<{ state: WalletState }>("select cost_wallet_read($1) as state", [buyer]))
    .rows[0].state;
}
it("runs purchase, pending, receipt approval, wallet refresh, then explicit build approval", async () => {
  await purchase();
  expect(walletStatus(await wallet()).availableCredits).toBe(0);
  const pending = await db.query(
    "select status,build_session,build_revision from manual_credit_payments where id=$1",
    [id],
  );
  expect(pending.rows[0]).toEqual({ status: "pending", build_session: buyer, build_revision: 2 });
  await review();
  let state = await wallet();
  expect(walletStatus(state).availableCredits).toBe(100);
  state = walletTransition(state, {
    type: "quote",
    id: "quote",
    runId: "run",
    specRevision: "v2",
    capUnits: 1000000,
    category: "build",
  }).state;
  expect(walletTransition(state, { type: "start", id: "early", runId: "run" }).allowed).toBe(false);
  state = walletTransition(state, {
    type: "approve",
    id: "approve",
    runId: "run",
    capUnits: 1000000,
    actorId: buyer,
  }).state;
  const started = walletTransition(state, { type: "start", id: "start", runId: "run" });
  expect(started.allowed).toBe(true);
  expect(walletStatus(started.state).reservedCredits).toBe(100);
  expect(
    (await db.query("select count(*)::int as count from cost_wallet_journal")).rows[0],
  ).toEqual({ count: 1 });
});
it("repeated approval grants only once", async () => {
  await purchase();
  await review();
  await review();
  expect(walletStatus(await wallet()).availableCredits).toBe(100);
});
it("blocks using one receipt twice and rolls back the second approval", async () => {
  await purchase();
  await review();
  await purchase(second);
  await expect(review(second)).rejects.toThrow();
  expect(walletStatus(await wallet()).availableCredits).toBe(100);
  expect(
    (await db.query("select status,reference from manual_credit_payments where id=$1", [second]))
      .rows[0],
  ).toEqual({ status: "pending", reference: null });
});
it("rejects nonstaff and missing bank reference", async () => {
  await purchase();
  await expect(review(id, buyer)).rejects.toThrow("Staff required");
  await expect(review(id, staff, true, null)).rejects.toThrow("Verified receipt");
  expect(walletStatus(await wallet()).availableCredits).toBe(0);
});
it("rejecting a purchase leaves the wallet unchanged", async () => {
  await purchase();
  await review(id, staff, false, null);
  await review();
  expect(walletStatus(await wallet()).availableCredits).toBe(0);
});
it("prevents duplicate pending orders", async () => {
  await purchase();
  await expect(purchase(second)).rejects.toThrow();
});
it("does not add funds on a QR view or an insufficient build attempt", async () => {
  await purchase();
  let state = initialWallet(buyer);
  state = walletTransition(state, {
    type: "quote",
    id: "q",
    runId: "r",
    specRevision: "v",
    capUnits: 1000000,
    category: "build",
  }).state;
  state = walletTransition(state, {
    type: "approve",
    id: "a",
    runId: "r",
    capUnits: 1000000,
    actorId: buyer,
  }).state;
  expect(walletTransition(state, { type: "start", id: "s", runId: "r" }).reason).toBe(
    "insufficient_credits",
  );
  expect(walletStatus(await wallet()).availableCredits).toBe(0);
});
it("blocks direct browser-role writes and approval RPC execution", async () => {
  await purchase();
  await db.exec("set role authenticated");
  try {
    await expect(db.query("update manual_credit_payments set status='credited'")).rejects.toThrow();
    await expect(review()).rejects.toThrow();
  } finally {
    await db.exec("reset role");
  }
});
