import { describe, expect, it } from "vitest";
import { analyticsUrl, isAnalyticsHost, sanitizeAnalyticsProperties } from "./analytics-policy";

describe("analytics privacy policy", () => {
  it("removes auth query strings and fragments from URLs", () => {
    expect(
      analyticsUrl("https://getbuildwise.vercel.app/apps?code=secret#access_token=secret"),
    ).toBe("https://getbuildwise.vercel.app/apps");
    expect(analyticsUrl("mailto:private@example.com")).toBe("");
    expect(analyticsUrl("not a URL")).toBe("");
  });
  it("sanitizes nested initial person properties and drops sensitive fields", () => {
    const result = sanitizeAnalyticsProperties({
      $current_url: "https://getbuildwise.vercel.app/signin?email=private@example.com",
      $set_once: {
        $initial_current_url: "https://getbuildwise.vercel.app/?code=secret",
        email: "private@example.com",
      },
      prompt: "private idea",
      access_token: "secret",
      utm_campaign: "private",
      $session_id: "session-id",
      $pageview_id: "view-id",
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|private/);
    expect(result.$session_id).toBe("session-id");
    expect(result.$pageview_id).toBe("view-id");
  });
  it("does not send localhost, previews or lookalike domains to production", () => {
    const hosts = "getbuildwise.vercel.app";
    expect(isAnalyticsHost(hosts, hosts)).toBe(true);
    for (const host of [
      "localhost",
      "preview.vercel.app",
      "getbuildwise.vercel.app.attacker.com",
    ]) {
      expect(isAnalyticsHost(host, hosts)).toBe(false);
    }
  });
});
