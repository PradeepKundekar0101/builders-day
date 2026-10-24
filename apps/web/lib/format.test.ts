import { describe, expect, test } from "vitest";
import { hoursText, humanize, usd } from "./format";

describe("usd", () => {
  test.each([
    [4.96, "$4.96"],
    [1, "$1.00"],
    [1234.5, "$1,234.50"],
  ])("%d -> %s", (value, text) => expect(usd(value)).toBe(text));
});

describe("hoursText", () => {
  test.each([
    [0, "no build time"],
    [0.5, "under an hour"],
    [1, "about 1 hour"],
    [4, "about 4 hours"],
    [4.25, "about 4 to 5 hours"],
    [0.99, "under an hour"],
  ])("%d -> %s", (hours, text) => expect(hoursText(hours)).toBe(text));
});

describe("humanize", () => {
  test.each([
    ["menu_item", "Menu item"],
    ["order", "Order"],
  ])("%s -> %s", (name, text) => expect(humanize(name)).toBe(text));
});
