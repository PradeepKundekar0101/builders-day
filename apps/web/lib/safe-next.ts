const FALLBACK = "/apps";
const PROBE_ORIGIN = "http://same-site.invalid";

/** Returns a same-site path to redirect to after sign-in, never an external URL. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/")) return FALLBACK;
  // Resolve the way the browser will, so tab, newline and backslash tricks cannot change the origin.
  const url = new URL(raw, PROBE_ORIGIN);
  if (url.origin !== PROBE_ORIGIN) return FALLBACK;
  return `${url.pathname}${url.search}${url.hash}`;
}
