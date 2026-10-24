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
export async function generateProduct(input: {
  spec: unknown;
  design: Design;
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
  for (const [name, content] of Object.entries(generatedFiles(spec, input.design))) {
    await mkdir(resolve(dir, name, ".."), { recursive: true });
    await writeFile(join(dir, name), content);
  }
  if (input.requirements)
    await writeFile(join(dir, "requirements.json"), JSON.stringify(input.requirements, null, 2));
  await input.onStep?.("Generated pages, forms and owner-scoped data routes.");
  const migration = await checkMigration(migrationFor(spec));
  await input.onStep?.(
    "Generated database migration applied successfully with row-level security.",
  );
  // The model never writes code, package manifests, scripts or filenames. Only this trusted template executes.
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    CI: "true",
    NEXT_TELEMETRY_DISABLED: "1",
    NODE_USE_SYSTEM_CA: "1",
  };
  await exec("npm", ["ci", "--ignore-scripts", "--no-audit", "--no-fund"], {
    cwd: dir,
    env,
    timeout: 180000,
    maxBuffer: 2_000_000,
  });
  await exec("npm", ["run", "typecheck"], { cwd: dir, env, timeout: 120000, maxBuffer: 2_000_000 });
  await exec("npm", ["run", "build"], { cwd: dir, env, timeout: 180000, maxBuffer: 2_000_000 });
  await input.onStep?.("TypeScript and production compilation passed.");
  const report = {
    typecheck: true,
    productionBuild: true,
    migration,
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
