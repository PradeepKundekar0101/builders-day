const FALLBACK = "/apps";

/** Returns a same-site path to redirect to after sign-in, never an external URL. */
export function safeNext(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) {
    return FALLBACK;
  }
  return raw;
}
