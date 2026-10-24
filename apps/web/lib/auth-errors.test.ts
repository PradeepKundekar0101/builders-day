import { describe, expect, test } from "vitest";
import { friendlyAuthError } from "./auth-errors";

describe("friendlyAuthError", () => {
  test.each(["over_email_send_rate_limit", "over_request_rate_limit"])(
    "%s asks the user to wait a minute",
    (code) => {
      expect(
        friendlyAuthError({
          code,
          message: "For security purposes, you can only request this after 0 seconds.",
        }),
      ).toBe("We just sent you a link. Wait a minute, then try again.");
    },
  );

  test("an invalid address is named plainly", () => {
    expect(friendlyAuthError({ code: "email_address_invalid", message: "x" })).toBe(
      "That email address doesn't look right. Check it and try again.",
    );
  });

  test("unknown errors never leak the raw message", () => {
    expect(friendlyAuthError({ code: "unexpected_failure", message: "pq: internal" })).toBe(
      "We couldn't send the link. Try again in a moment.",
    );
    expect(friendlyAuthError({ message: "fetch failed" })).toBe(
      "We couldn't send the link. Try again in a moment.",
    );
  });
});
