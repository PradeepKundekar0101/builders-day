import { cp, mkdir, writeFile, readFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { PGlite } from "@electric-sql/pglite";
import { generatedFiles, migrationFor, supportedSpec, type Design } from "@buildwise/build-engine";
const exec = promisify(execFile);
export async function checkMigration(sql: string) {
  const pg = new PGlite();
  try {
    await pg.exec(
      "create schema auth; create role authenticated; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;",
    );
    await pg.exec(sql);
    const rows = await pg.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname,relrowsecurity from pg_class c join pg_namespace n on c.relnamespace=n.oid where n.nspname='public' and c.relkind='r'",
    );
    if (rows.rows.some((r) => !r.relrowsecurity)) throw new Error("RLS missing");
    return { tables: rows.rows.length, rls: true };
  } finally {
    await pg.close();
  }
}
export function defaultDesign(raw: unknown): Design {
  const spec = supportedSpec(raw);
  return {
    headline: spec.name.slice(0, 140),
    description: spec.summary.slice(0, 600) || spec.name,
    accent: "violet",
    pages: spec.pages.map((p) => ({
      title: p.name.slice(0, 80),
      body: p.purpose.slice(0, 3000) || p.name,
    })),
  };
}
const buildEnv = () => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  CI: "true",
  NEXT_TELEMETRY_DISABLED: "1",
  NODE_USE_SYSTEM_CA: "1",
});
/** Lays down the trusted template, canonical spec and checked migration, then installs pinned dependencies. */
export async function prepareProduct(input: {
  spec: unknown;
  design?: Design;
  requirements?: unknown;
  directory: string;
  template: string;
  onStep?: (message: string) => Promise<void>;
}) {
  const spec = supportedSpec(input.spec),
    dir = resolve(input.directory);
  await mkdir(dir, { recursive: true });
  await cp(input.template, dir, {
    recursive: true,
    filter: (source) =>
      !source.split("/").some((p) => ["node_modules", ".next", ".env.local"].includes(p)),
  });
  for (const [name, content] of Object.entries(
    generatedFiles(spec, input.design ?? defaultDesign(spec)),
  )) {
    await mkdir(resolve(dir, name, ".."), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  if (input.requirements)
    await writeFile(join(dir, "requirements.json"), JSON.stringify(input.requirements, null, 2));
  const migration = await checkMigration(migrationFor(spec));
  await input.onStep?.(
    "Generated database migration applied successfully with row-level security.",
  );
  // Dependencies come only from the trusted template lockfile, installed without lifecycle scripts.
  await exec("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: dir,
    env: buildEnv(),
    timeout: 180000,
    maxBuffer: 2_000_000,
  });
  return { dir, migration };
}
/** Compiles and packages the product. Agent-written UI code runs here, so the env carries no secrets. */
export async function verifyProduct(input: {
  directory: string;
  migration: Awaited<ReturnType<typeof checkMigration>>;
  agent?: { model: string; summary: string };
  onStep?: (message: string) => Promise<void>;
}) {
  const dir = resolve(input.directory),
    env = buildEnv();
  await exec("npm", ["run", "typecheck"], { cwd: dir, env, timeout: 120000, maxBuffer: 2_000_000 });
  await exec("npm", ["run", "build"], { cwd: dir, env, timeout: 180000, maxBuffer: 2_000_000 });
  await input.onStep?.("TypeScript and production compilation passed.");
  const report = {
    typecheck: true,
    productionBuild: true,
    migration: input.migration,
    ...(input.agent && { codeAgent: input.agent }),
    productAcceptance: "Requires human review",
    deployment: "Not deployed",
  };
  await writeFile(join(dir, "build-report.json"), JSON.stringify(report, null, 2));
  await exec(
    "zip",
    ["-qr", "product.zip", ".", "-x", "node_modules/*", ".next/*", "product.zip", ".env*"],
    { cwd: dir, env, timeout: 30000 },
  );
  return { report, archive: await readFile(join(dir, "product.zip")) };
}
/** Template-only build with no model involvement. */
export async function generateProduct(input: Parameters<typeof prepareProduct>[0]) {
  const { dir, migration } = await prepareProduct(input);
  return verifyProduct({ directory: dir, migration, onStep: input.onStep });
}
