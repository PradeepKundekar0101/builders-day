import { z } from "zod";

const ServerEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  MASK_MAP_KEY: z
    .string()
    .refine((value) => Buffer.from(value, "base64").length === 32, "must be 32 bytes, base64"),
  AGENT_API_TOKEN: z.string().min(32),
});

export type ServerEnv = { serviceRoleKey: string; maskMapKey: string; agentApiToken: string };

export function parseServerEnv(raw: Record<string, string | undefined>): ServerEnv {
  const result = ServerEnvSchema.safeParse(raw);
  if (!result.success) {
    const names = [...new Set(result.error.issues.map((issue) => String(issue.path[0])))];
    throw new Error(`Missing or invalid server environment variables: ${names.join(", ")}`);
  }
  return {
    serviceRoleKey: result.data.SUPABASE_SERVICE_ROLE_KEY,
    maskMapKey: result.data.MASK_MAP_KEY,
    agentApiToken: result.data.AGENT_API_TOKEN,
  };
}

let cached: ServerEnv | undefined;

/** Read lazily so a build without server secrets still succeeds. */
export function serverEnv(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
