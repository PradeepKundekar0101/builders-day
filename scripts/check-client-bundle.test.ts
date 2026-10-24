import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, test } from "vitest";
import { scanClientBundle } from "./check-client-bundle";

const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const serviceJwt = `${enc({ alg: "HS256" })}.${enc({ role: "service_role" })}.c2ln`;
const anonJwt = `${enc({ alg: "HS256" })}.${enc({ role: "anon" })}.c2ln`;

let dir: string;
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "bundle-"));
});

describe("scanClientBundle", () => {
  test("clean bundle returns []", () => {
    writeFileSync(join(dir, "app.js"), `createClient(url, "${anonJwt}")`);
    expect(scanClientBundle(dir, [])).toEqual([]);
  });

  test("file containing a service_role JWT is reported", () => {
    writeFileSync(join(dir, "app.js"), `const k="${serviceJwt}"`);
    expect(scanClientBundle(dir, [])).toEqual([{ file: "app.js", reason: "service_role JWT" }]);
  });

  test("file containing the forbidden literal value is reported", () => {
    writeFileSync(join(dir, "app.js"), `const k="sb_secret_abc123"`);
    expect(scanClientBundle(dir, ["sb_secret_abc123"])).toEqual([
      { file: "app.js", reason: "forbidden value #1" },
    ]);
  });

  test("the secret variable name is reported", () => {
    writeFileSync(join(dir, "app.js"), `process.env.SUPABASE_SERVICE_ROLE_KEY`);
    expect(scanClientBundle(dir, [])).toEqual([
      { file: "app.js", reason: "SUPABASE_SERVICE_ROLE_KEY" },
    ]);
  });

  test.each(["MASK_MAP_KEY", "AGENT_API_TOKEN"])("the %s name is reported", (name) => {
    writeFileSync(join(dir, "app.js"), `process.env.${name}`);
    expect(scanClientBundle(dir, [])).toEqual([{ file: "app.js", reason: name }]);
  });

  test("nested directories are scanned", () => {
    mkdirSync(join(dir, "chunks", "deep"), { recursive: true });
    writeFileSync(join(dir, "chunks", "deep", "x.js"), serviceJwt);
    expect(scanClientBundle(dir, [])).toEqual([
      { file: join("chunks", "deep", "x.js"), reason: "service_role JWT" },
    ]);
  });

  test.each(["a.js", "a.mjs", "a.css", "a.html", "a.json", "a.js.map"])("scans %s", (name) => {
    writeFileSync(join(dir, name), serviceJwt);
    expect(scanClientBundle(dir, [])).toHaveLength(1);
  });

  test("ignores binary assets", () => {
    writeFileSync(join(dir, "font.woff2"), serviceJwt);
    expect(scanClientBundle(dir, [])).toEqual([]);
  });
});
