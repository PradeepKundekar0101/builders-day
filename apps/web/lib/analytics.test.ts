import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

const sdk = vi.hoisted(() => ({
  init: vi.fn(),
  identify: vi.fn(),
  reset: vi.fn(),
  capture: vi.fn(),
  get_property: vi.fn(),
}));
vi.mock("posthog-js", () => ({ default: sdk }));

beforeEach(() => {
  vi.resetModules();
  vi.resetAllMocks();
  vi.stubGlobal("window", { location: { hostname: "getbuildwise.vercel.app", pathname: "/apps" } });
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "phc_test_only");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
  vi.stubEnv("NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS", "getbuildwise.vercel.app");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("analytics lifecycle", () => {
  it("is disabled without configuration and does not emit events", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN", "");
    const analytics = await import("./analytics");
    analytics.initializeAnalytics();
    analytics.identifyAnalyticsUser("user-1");
    analytics.captureAuthenticatedAppVisit();
    expect(sdk.init).not.toHaveBeenCalled();
    expect(sdk.identify).not.toHaveBeenCalled();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
  it("initializes once and excludes preview traffic", async () => {
    const analytics = await import("./analytics");
    window.location.hostname = "buildwise-preview.vercel.app";
    analytics.initializeAnalytics();
    expect(sdk.init).not.toHaveBeenCalled();
    window.location.hostname = "getbuildwise.vercel.app";
    analytics.initializeAnalytics();
    analytics.initializeAnalytics();
    expect(sdk.init).toHaveBeenCalledTimes(1);
    expect(sdk.init.mock.calls[0][1]).toMatchObject({
      disable_session_recording: true,
      mask_all_text: true,
    });
  });
  it("resets identity on logout and account switching", async () => {
    const analytics = await import("./analytics");
    analytics.initializeAnalytics();
    sdk.get_property.mockReturnValue("old-user");
    analytics.identifyAnalyticsUser("new-user");
    expect(sdk.reset).toHaveBeenCalledTimes(1);
    expect(sdk.identify).toHaveBeenCalledWith("new-user");
    analytics.identifyAnalyticsUser(null);
    expect(sdk.reset).toHaveBeenCalledTimes(2);
  });
  it("drops auth callback events and strips URL credentials", async () => {
    const analytics = await import("./analytics");
    analytics.initializeAnalytics();
    const beforeSend = sdk.init.mock.calls[0][1].before_send;
    const event = {
      event: "$pageview",
      properties: { $current_url: "https://getbuildwise.vercel.app/apps?code=secret" },
    };
    expect(beforeSend(event).properties.$current_url).toBe("https://getbuildwise.vercel.app/apps");
    window.location.pathname = "/auth/confirm";
    expect(beforeSend(event)).toBeNull();
  });
  it("does not propagate SDK initialization failures into the app", async () => {
    sdk.init.mockImplementation(() => {
      throw new Error("blocked");
    });
    const analytics = await import("./analytics");
    expect(() => analytics.initializeAnalytics()).not.toThrow();
    analytics.captureAuthenticatedAppVisit();
    expect(sdk.capture).not.toHaveBeenCalled();
  });
  it("preserves the configured routing token while removing private tokens and person URLs", async () => {
    const analytics = await import("./analytics");
    analytics.initializeAnalytics();
    const beforeSend = sdk.init.mock.calls[0][1].before_send;
    const event = beforeSend({
      event: "$pageview",
      properties: { token: "phc_test_only", access_token: "private", distinct_id: "anon-1" },
      $set: { email: "private@example.com", role: "builder" },
      $set_once: { $initial_current_url: "https://getbuildwise.vercel.app/?code=private" },
    });
    expect(event.properties.token).toBe("phc_test_only");
    expect(event.properties.distinct_id).toBe("anon-1");
    expect(event.properties.access_token).toBeUndefined();
    expect(event.$set).toEqual({ role: "builder" });
    expect(event.$set_once.$initial_current_url).toBe("https://getbuildwise.vercel.app/");
  });
});
