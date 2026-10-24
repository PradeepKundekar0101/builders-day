import { randomBytes } from "node:crypto";
import { describe, expect, test } from "vitest";
import { parseServerEnv } from "./env";

const valid = {
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  MASK_MAP_KEY: randomBytes(32).toString("base64"),
  AGENT_API_TOKEN: "a".repeat(32),
};

describe("parseServerEnv", () => {
  test("reads a valid environment", () => {
    expect(parseServerEnv(valid)).toEqual({
      serviceRoleKey: "service-key",
      maskMapKey: valid.MASK_MAP_KEY,
      agentApiToken: valid.AGENT_API_TOKEN,
    });
  });

  test("rejects a mask key that is not 32 bytes", () => {
    expect(() =>
      parseServerEnv({ ...valid, MASK_MAP_KEY: randomBytes(16).toString("base64") }),
    ).toThrow(/MASK_MAP_KEY/);
  });

  test("rejects a short agent token", () => {
    expect(() => parseServerEnv({ ...valid, AGENT_API_TOKEN: "short" })).toThrow(/AGENT_API_TOKEN/);
  });

  test("names every missing variable without printing values", () => {
    expect(() => parseServerEnv({})).toThrow(
      "Missing or invalid server environment variables: SUPABASE_SERVICE_ROLE_KEY, MASK_MAP_KEY, AGENT_API_TOKEN",
    );
  });
});
