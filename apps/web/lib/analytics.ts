import posthog from "posthog-js";
import { isAnalyticsHost, sanitizeAnalyticsProperties } from "./analytics-policy";

let ready = false;

export function initializeAnalytics() {
  if (ready || typeof window === "undefined") return;
  const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
  const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;
  const allowedHosts = process.env.NEXT_PUBLIC_POSTHOG_ALLOWED_HOSTS;
  if (!token || !host || !allowedHosts || !isAnalyticsHost(window.location.hostname, allowedHosts))
    return;

  try {
    posthog.init(token, {
      api_host: host,
      defaults: "2026-08-30",
      person_profiles: "identified_only",
      capture_pageview: "history_change",
      capture_pageleave: true,
      autocapture: { dom_event_allowlist: ["click"], capture_copied_text: false },
      capture_heatmaps: true,
      mask_all_text: true,
      mask_all_element_attributes: true,
      disable_session_recording: true,
      capture_exceptions: false,
      disable_surveys: true,
      before_send: (event) => {
        if (!event || window.location.pathname.startsWith("/auth/")) return null;
        event.properties = sanitizeAnalyticsProperties(event.properties);
        // The public project token is a required SDK transport field, not user data.
        event.properties.token = token;
        if (event.$set) event.$set = sanitizeAnalyticsProperties(event.$set);
        if (event.$set_once) event.$set_once = sanitizeAnalyticsProperties(event.$set_once);
        event.properties.app = "buildwise";
        event.properties.analytics_schema_version = 1;
        return event;
      },
    });
    ready = true;
  } catch {
    // Analytics must never prevent the application from loading.
  }
}

/** Use a verified opaque auth ID, never an email or an ID from a URL parameter. */
export function identifyAnalyticsUser(userId: string | null) {
  if (!ready) return;
  if (userId) {
    const previousUser = posthog.get_property("$user_id");
    if (previousUser && previousUser !== userId) posthog.reset();
    posthog.identify(userId);
  } else if (posthog.get_property("$user_id")) {
    posthog.reset();
  }
}

export function captureAuthenticatedAppVisit() {
  if (!ready) return;
  posthog.capture("authenticated_app_opened");
}
