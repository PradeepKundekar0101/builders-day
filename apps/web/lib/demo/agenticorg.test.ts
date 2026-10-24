import { describe, expect, test } from "vitest";
import { reviewFromOutput } from "./agenticorg";

describe("reviewFromOutput", () => {
  test("reads the JSON shape the prompt asks for", () => {
    expect(
      reviewFromOutput({
        risk: "high",
        summary: "Payments raise the stakes.",
        checks: ["Check one", "Check two", "Check three", "Extra"],
      }),
    ).toEqual({
      risk: "high",
      summary: "Payments raise the stakes.",
      checks: ["Check one", "Check two", "Check three"],
    });
  });

  test("parses JSON returned inside a text field", () => {
    const text =
      'Here you go: {"risk":"medium","summary":"Sign-in needs care.","checks":["A","B","C"]}';
    expect(reviewFromOutput({ response: text })).toMatchObject({
      risk: "medium",
      checks: ["A", "B", "C"],
    });
  });

  test("falls back to a plain summary", () => {
    expect(reviewFromOutput({ summary: "Online payments need strong protection." })).toEqual({
      risk: null,
      summary: "Online payments need strong protection.",
      checks: [],
    });
  });

  test("an unknown risk value is dropped, not trusted", () => {
    expect(reviewFromOutput({ risk: "catastrophic", summary: "x" })?.risk).toBeNull();
  });

  test("nothing usable gives null", () => {
    expect(reviewFromOutput({})).toBeNull();
    expect(reviewFromOutput({ count: 3 })).toBeNull();
  });
});
