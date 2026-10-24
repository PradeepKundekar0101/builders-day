import { describe, expect, test } from "vitest";
import { findServiceRoleJwts } from "./index";

function jwt(payload: Record<string, unknown>): string {
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${enc({ alg: "HS256", typ: "JWT" })}.${enc(payload)}.c2lnbmF0dXJl`;
}

const service = jwt({ iss: "supabase", role: "service_role" });
const anon = jwt({ iss: "supabase", role: "anon" });

describe("findServiceRoleJwts", () => {
  test("finds a service_role JWT embedded in minified JS", () => {
    const js = `var a="${anon}";const k="${service}";createClient(u,k)`;
    expect(findServiceRoleJwts(js)).toEqual([service]);
  });

  test("ignores an anon JWT", () => {
    expect(findServiceRoleJwts(`const k="${anon}"`)).toEqual([]);
  });

  test("returns [] for random text and malformed JWT fragments", () => {
    expect(findServiceRoleJwts("hello world")).toEqual([]);
    expect(findServiceRoleJwts("eyJhbGciOi.eyJub3RqcybmFsZQ.sig")).toEqual([]);
  });

  test("returns every service_role JWT", () => {
    const other = jwt({ role: "service_role", ref: "abc" });
    expect(findServiceRoleJwts(`${service} and ${other}`)).toEqual([service, other]);
  });
});
