import process from "node:process";
import { URL } from "node:url";
import console from "node:console";
// Run with PGlite installed in an isolated directory: see integration guide.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const { PGlite } = await import(process.env.PGLITE_MODULE || "@electric-sql/pglite");
const db = new PGlite();
await db.exec(`
create role anon; create role authenticated; create role service_role bypassrls;
create schema auth;
create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.user_id',true),'')::uuid $$;
create table public.ideas(id uuid primary key,user_id uuid references auth.users,text text check(length(text) between 50 and 2000),links text[],status text);
create table public.intake_messages(id uuid default gen_random_uuid(),idea_id uuid references public.ideas,role text,content text);
`);
await db.exec(
  await readFile(
    new URL("../../supabase/migrations/20261024010000_prompt_studio.sql", import.meta.url),
    "utf8",
  ),
);
const user = "11111111-1111-4111-8111-111111111111";
const other = "22222222-2222-4222-8222-222222222222";
const id = "33333333-3333-4333-8333-333333333333";
const mutation = "44444444-4444-4444-8444-444444444444";
const mutation2 = "55555555-5555-4555-8555-555555555555";
await db.query("insert into auth.users values ($1),($2)", [user, other]);
const payload = {
  revision: 1,
  input: { idea: "Build a client portal where customers can view project updates.", links: [] },
  questions: [{ id: "roles", question: "Who?", answer: "Customers" }],
};
const call = (owner, rev, mid, body = payload) =>
  db.query("select public.save_prompt_studio($1,$2,$3,$4,$5,$6) as result", [
    id,
    owner,
    rev,
    mid,
    JSON.stringify(body),
    "draft",
  ]);
assert.equal((await call(user, 0, mutation)).rows[0].result.revision, 1);
assert.equal((await call(user, 0, mutation)).rows[0].result.revision, 1);
assert.equal(
  (await db.query("select count(*)::int as n from public.intake_messages")).rows[0].n,
  3,
);
await assert.rejects(call(user, 0, mutation2), (e) => e.code === "40001");
await assert.rejects(call(other, 1, mutation2), (e) => e.code === "P0002");
await assert.rejects(
  call(user, 0, mutation, {
    ...payload,
    input: {
      ...payload.input,
      idea: "A different product description with sufficient length to be valid.",
    },
  }),
  (e) => e.code === "40001",
);
assert.equal((await call(user, 1, mutation2)).rows[0].result.revision, 2);
await db.exec(
  "grant usage on schema public,auth to authenticated; grant select,insert,update,delete on public.prompt_studio_sessions, public.prompt_studio_versions to authenticated; set role authenticated;",
);
await db.query("select set_config('test.user_id',$1,false)", [other]);
assert.equal((await db.query("select * from public.prompt_studio_versions")).rows.length, 0);
await assert.rejects(call(other, 2, mutation2), (e) => e.code === "42501");
await db.query("select set_config('test.user_id',$1,false)", [user]);
assert.equal((await db.query("select * from public.prompt_studio_versions")).rows.length, 2);
assert.equal(
  (await db.query("delete from public.prompt_studio_versions returning *")).rows.length,
  0,
);
await db.close();
console.log(
  "PASS: migration, atomic save, idempotency, conflicts, ownership, owner reads, blocked direct mutation and RPC access",
);
