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
  const result = PublicEnvSchema.safeParse(raw);
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
