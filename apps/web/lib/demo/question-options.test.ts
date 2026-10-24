import { describe, expect, test } from "vitest";
import { planFromIdea } from "./plan";
import { questionOptions } from "./question-options";

const portal = planFromIdea(
  "A client portal for my design agency where clients sign in, see project progress and approve designs.",
);
const shop = planFromIdea("A small shop where customers browse products and pay online.");

describe("questionOptions", () => {
  test.each(["audience", "journey", "data"])("%s has four distinct options", (id) => {
    const options = questionOptions(id, portal);
    expect(options).toHaveLength(4);
    expect(new Set(options).size).toBe(4);
  });

  test("options name the idea's main data", () => {
    expect(questionOptions("journey", portal).join(" ")).toMatch(/project/i);
    expect(questionOptions("audience", shop).join(" ")).toMatch(/product/i);
  });

  test("a paid app offers a purchase journey", () => {
    expect(questionOptions("journey", shop).join(" ")).toMatch(/pay/i);
  });

  test("unknown questions get no options", () => {
    expect(questionOptions("something-else", portal)).toEqual([]);
  });
});
