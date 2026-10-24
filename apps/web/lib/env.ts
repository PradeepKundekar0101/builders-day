import { z } from "zod";

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
  NEXT_PUBLIC_AUTH_GOOGLE_ENABLED: z.string().optional(),
});

export type PublicEnv = {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
  googleAuthEnabled: boolean;
};

export function parsePublicEnv(raw: Record<string, string | undefined>): PublicEnv {
  // Vercel preview deployments get their own URL per branch.
  const branchUrl = raw.NEXT_PUBLIC_VERCEL_BRANCH_URL;
  const withSiteUrl = {
    ...raw,
    NEXT_PUBLIC_SITE_URL:
      raw.NEXT_PUBLIC_SITE_URL || (branchUrl ? `https://${branchUrl}` : undefined),
  };
  const result = PublicEnvSchema.safeParse(withSiteUrl);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Missing or invalid environment variables: ${names.join(", ")}`);
  }
  return {
    supabaseUrl: result.data.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: result.data.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    siteUrl: result.data.NEXT_PUBLIC_SITE_URL.replace(/\/$/, ""),
    googleAuthEnabled: result.data.NEXT_PUBLIC_AUTH_GOOGLE_ENABLED === "true",
  };
}
