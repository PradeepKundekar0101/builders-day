import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { migrationFor } from "@buildwise/build-engine";
import {
  CreditWallet,
  PostgresWalletStore,
  CostGuard,
  PostgresStore,
  runBoundedCall,
  type RpcClient,
} from "@buildwise/cost-guard";
import { checkMigration } from "./generate";
const a = "11111111-1111-4111-8111-111111111111",
  b = "22222222-2222-4222-8222-222222222222",
  session = "33333333-3333-4333-8333-333333333333";
const spec = {
  name: "Tasks",
  summary: "Personal tasks",
  pages: [{ name: "Home", purpose: "Welcome", mustHave: true }],
  entities: [
    {
      name: "tasks",
      ownerScoped: true,
      mustHave: true,
      fields: [{ name: "title", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
};
it("generated migration applies and denies cross-owner CRUD", async () => {
  expect((await checkMigration(migrationFor(spec))).tables).toBe(1);
  const pg = new PGlite();
  try {
    await pg.exec(
      "create schema auth; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated; grant execute on function auth.uid() to authenticated;",
    );
    await pg.exec(migrationFor(spec));
    await pg.exec(
      `insert into auth.users values('${a}'),('${b}'); set role authenticated; set request.jwt.claim.sub='${a}'; insert into public.tasks(user_id,title) values('${a}','Private');`,
    );
    await expect(
      pg.exec(`insert into public.tasks(user_id,title) values('${b}','Forged')`),
    ).rejects.toThrow();
    await pg.exec(`set request.jwt.claim.sub='${b}';`);
    expect((await pg.query("select * from public.tasks")).rows).toHaveLength(0);
    expect(
      (await pg.query("update public.tasks set title='Stolen' returning *")).rows,
    ).toHaveLength(0);
    expect((await pg.query("delete from public.tasks returning *")).rows).toHaveLength(0);
  } finally {
    await pg.close();
  }
}, 30000);
it("all migrations apply; reviewed handoff is immutable, owned and claim is unique", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create schema auth; create role anon; create role authenticated; create role service_role bypassrls; create table auth.users(id uuid primary key,email text); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; create publication supabase_realtime; create schema storage; create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
    );
    const root = fileURLToPath(new URL("../../../supabase/migrations/", import.meta.url)),
      files = (await readdir(root)).filter((n) => n.endsWith(".sql")).sort();
    expect(new Set(files.map((n) => n.split("_")[0])).size).toBe(files.length);
    for (const file of files) await pg.exec(await readFile(root + file, "utf8"));
    expect(
      (
        await pg.query<{ fee: string }>(
          "select config->>'deployUsd' as fee from public.cost_pricing_versions where version='source-v1'",
        )
      ).rows[0]?.fee,
    ).toBe("0");
    await pg.query("insert into auth.users values($1,$2),($3,$4)", [
      a,
      "a@example.test",
      b,
      "b@example.test",
    ]);
    const draft = {
      schemaVersion: "1.0",
      revision: 1,
      input: {
        idea: "A personal task tracker with a private list of tasks for each authenticated account.",
        links: [],
      },
      questions: [],
      spec,
      acceptanceCriteria: ["Create and edit tasks"],
      adapterMode: "mock",
    };
    await pg.query("select public.save_prompt_studio($1,$2,0,$3,$4,$5)", [
      session,
      a,
      crypto.randomUUID(),
      JSON.stringify(draft),
      "user_reviewed",
    ]);
    await expect(
      pg.query("select public.prepare_studio_build($1,$2,1,$3)", [b, session, []]),
    ).rejects.toThrow();
    const first = await pg.query<{ id: string }>(
      "select public.prepare_studio_build($1,$2,1,$3) as id",
      [a, session, []],
    );
    const specId = first.rows[0]!.id;
    expect(
      (
        await pg.query<{ id: string }>("select public.prepare_studio_build($1,$2,1,$3) as id", [
          a,
          session,
          [],
        ])
      ).rows[0]!.id,
    ).toBe(specId);
    const run = crypto.randomUUID();
    await pg.query(
      "insert into public.quotes(id,spec_id,user_id,cost_usd,low_usd,high_usd,hours,model_budget_usd,weights_version,share_slug) values($1::uuid,$2,$3,1,1,1,1,1,'v1',$1::text)",
      [run, specId, a],
    );
    await pg.query("update public.quotes set status='locked',spec_revision='test:1' where id=$1", [
      run,
    ]);
    const client: RpcClient = {
      async rpc(name, args) {
        try {
          if (!/^cost_(wallet|guard)_(read|cas)$/.test(name)) throw new Error("Unexpected RPC");
          const read = name.endsWith("read");
          const params = [
            name.startsWith("cost_wallet") ? args.p_account_id : args.p_build_id,
            ...(read
              ? []
              : [
                  args.p_expected_version,
                  JSON.stringify(args.p_state),
                  JSON.stringify(args.p_command),
                ]),
          ];
          const { rows } = await pg.query<{ result: unknown }>(
            `select public.${name}(${read ? "$1" : "$1,$2,$3,$4"}) as result`,
            params,
          );
          return { data: rows[0]?.result, error: null };
        } catch (e) {
          return { data: null, error: { message: String(e) } };
        }
      },
    };
    const wallet = new CreditWallet(new PostgresWalletStore(client)),
      guard = new CostGuard(new PostgresStore(client));
    await wallet.execute(a, {
      type: "allowance",
      id: "free-test",
      plan: "free",
      period: "2026-10",
    });
    await wallet.execute(a, {
      type: "quote",
      id: "quote",
      runId: run,
      quoteId: run,
      specRevision: "test:1",
      capUnits: 1000000,
      category: "build",
    });
    await wallet.execute(a, {
      type: "approve",
      id: "approve",
      runId: run,
      capUnits: 1000000,
      actorId: a,
    });
    expect((await wallet.execute(a, { type: "start", id: "start", runId: run })).allowed).toBe(
      true,
    );
    await expect(
      pg.query("update public.specs set spec='{}' where id=$1", [specId]),
    ).rejects.toThrow();
    expect(
      (await pg.query<{ job: { id: string } }>("select public.claim_studio_build('one') as job"))
        .rows[0]!.job.id,
    ).toBe(run);
    expect(
      (await pg.query<{ job: unknown }>("select public.claim_studio_build('two') as job")).rows[0]!
        .job,
    ).toBeNull();
    await wallet.execute(a, {
      type: "beginAttempt",
      id: "begin",
      runId: run,
      attemptId: "attempt",
    });
    let providerCalls = 0;
    const call = () =>
      runBoundedCall({
        guard,
        buildId: run,
        callId: "call",
        taskId: "design",
        maxMicros: 100,
        execute: async () => {
          providerCalls++;
          return {
            value: "generated",
            actualMicros: 50,
            inputTokens: 10,
            outputTokens: 10,
            pricingVersion: "test",
          };
        },
      });
    expect((await call()).executed).toBe(true);
    expect((await call()).executed).toBe(false);
    expect(providerCalls).toBe(1);
    await pg.query("update public.builds set heartbeat_at=now()-interval '3 minutes' where id=$1", [
      run,
    ]);
    await pg.exec("select public.claim_studio_build('two')");
    expect(
      (
        await pg.query<{ status: string }>(
          "select status from public.build_outputs where build_id=$1",
          [run],
        )
      ).rows[0]!.status,
    ).toBe("needs_review");
  } finally {
    await pg.close();
  }
}, 30000);
