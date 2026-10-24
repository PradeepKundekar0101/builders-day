import { describe, expect, test } from "vitest";
import { z } from "zod";
import { IntakeError } from "./intake/service";
import { bearerMatches, errorResponse, isSameOrigin } from "./http";

describe("errorResponse", () => {
  test.each([
    ["invalid_idea", 400],
    ["invalid_selection", 400],
    ["not_found", 404],
    ["question_limit", 409],
    ["wrong_state", 409],
    ["invalid_spec", 422],
  ] as const)("%s maps to %i", async (code, status) => {
    const response = errorResponse(new IntakeError(code, "Readable message."));
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error: code, message: "Readable message." });
  });

  test("invalid_spec carries the issues", async () => {
    const issues = [{ path: ["pages"], message: "Too small" }];
    const response = errorResponse(new IntakeError("invalid_spec", "Bad spec.", issues));
    expect(await response.json()).toMatchObject({ issues });
  });

  test("a bad request body is a 400 without internals", async () => {
    const parsed = z.object({ text: z.string() }).safeParse({});
    const response = errorResponse(parsed.error);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "bad_request",
      message: "The request is invalid.",
    });
  });

  test("anything else is a 500 that leaks nothing", async () => {
    const response = errorResponse(new Error("pq: connection refused at 10.0.0.3"));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("10.0.0.3");
  });
});

describe("bearerMatches", () => {
  const token = "t".repeat(40);
  test("accepts the exact token", () => {
    expect(bearerMatches(`Bearer ${token}`, token)).toBe(true);
  });
  test.each([null, "", "Bearer", `Bearer ${token}x`, `Basic ${token}`, token])(
    "rejects %s",
    (header) => {
      expect(bearerMatches(header, token)).toBe(false);
    },
  );
});

describe("isSameOrigin", () => {
  const request = (origin: string | null) =>
    new Request("https://getbuildwise.vercel.app/api/ideas", {
      method: "POST",
      headers: origin ? { origin } : {},
    });
  test("accepts our own origin", () => {
    expect(isSameOrigin(request("https://getbuildwise.vercel.app"))).toBe(true);
  });
  test.each([null, "https://evil.example", "null"])("rejects %s", (origin) => {
    expect(isSameOrigin(request(origin))).toBe(false);
  });
});
