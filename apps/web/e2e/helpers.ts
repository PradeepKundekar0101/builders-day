import { randomUUID } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

export const remote = Boolean(process.env.E2E_BASE_URL);

export function freshEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@test.buildwise.local`;
}

function admin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Returns an /auth/confirm path carrying a valid admin-generated token for email. */
export async function generatedConfirmPath(email: string, next = "/apps"): Promise<string> {
  const db = admin();
  await db.auth.admin.createUser({ email, email_confirm: true });
  const { data, error } = await db.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const token = data.properties.hashed_token;
  return `/auth/confirm?token_hash=${token}&type=email&next=${encodeURIComponent(next)}`;
}

/** Signs in through /auth/confirm with an admin-generated token, skipping the inbox. */
export async function signInViaGeneratedLink(page: Page, email: string): Promise<void> {
  await page.goto(await generatedConfirmPath(email));
  await expect(page.getByRole("heading", { name: "My apps" })).toBeVisible();
}

/** Polls the local Mailpit inbox and returns the /auth/confirm link sent to email. */
export async function fetchSignInLink(email: string): Promise<string> {
  const mailpit = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
  for (let attempt = 0; attempt < 20; attempt++) {
    const search = await fetch(
      `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`,
    );
    const { messages } = (await search.json()) as { messages: { ID: string }[] };
    if (messages[0]) {
      const message = await fetch(`${mailpit}/api/v1/message/${messages[0].ID}`);
      const { HTML } = (await message.json()) as { HTML: string };
      const href = HTML.match(/href="([^"]*\/auth\/confirm[^"]*)"/)?.[1];
      if (href) return href.replaceAll("&amp;", "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`No sign-in email for ${email}`);
}

export async function expectNoHorizontalScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}
