import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { findServiceRoleJwts } from "@buildwise/shared";

export type Finding = { file: string; reason: string };

const SCANNED = /\.(js|mjs|cjs|css|html|json|map|txt|rsc)$/;
const SERVER_SECRETS = ["SUPABASE_SERVICE_ROLE_KEY", "MASK_MAP_KEY", "AGENT_API_TOKEN"];

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(path);
    else if (SCANNED.test(entry.name)) yield path;
  }
}

/** Lists every file under dir that carries a server-only secret. */
export function scanClientBundle(dir: string, forbiddenValues: string[]): Finding[] {
  const findings: Finding[] = [];
  for (const path of walk(dir)) {
    const text = readFileSync(path, "utf8");
    const file = relative(dir, path);
    if (findServiceRoleJwts(text).length > 0) findings.push({ file, reason: "service_role JWT" });
    forbiddenValues.forEach((value, i) => {
      if (value && text.includes(value))
        findings.push({ file, reason: `forbidden value #${i + 1}` });
    });
    for (const name of SERVER_SECRETS) {
      if (text.includes(name)) findings.push({ file, reason: name });
    }
  }
  return findings;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? join(import.meta.dirname, "../apps/web/.next/static");
  const values = SERVER_SECRETS.map((name) => process.env[name] ?? "");
  const findings = scanClientBundle(dir, values);
  if (findings.length > 0) {
    for (const { file, reason } of findings) console.error(`${file}: ${reason}`);
    process.exit(1);
  }
  console.log("No server secrets found in client bundle.");
}
