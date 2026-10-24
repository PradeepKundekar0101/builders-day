import { safeNext } from "./safe-next";
/** The hosted email template appends &token_hash=...&type=email. */
export function emailReturnUrl(siteUrl: string, next: string) {
  return `${siteUrl.replace(/\/$/, "")}/auth/confirm?next=${encodeURIComponent(safeNext(next))}`;
}
