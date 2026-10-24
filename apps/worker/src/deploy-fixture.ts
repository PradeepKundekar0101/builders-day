import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { VercelConfig, deployToVercel, projectName } from "./vercel";
// Deploys an already built product directory (for example from agent:fixture) to Vercel. Writes nothing to Supabase.
const directory = process.argv[2];
if (!directory) throw new Error("Usage: deploy:fixture <built product directory>");
const live = await deployToVercel({
  directory: resolve(directory),
  name: projectName(process.argv[3] ?? randomUUID()),
  config: VercelConfig.parse({
    token: process.env.VERCEL_TOKEN,
    teamId: process.env.VERCEL_TEAM_ID || undefined,
    embedOrigin: process.env.PROVN_SITE_URL
      ? new URL(process.env.PROVN_SITE_URL).origin
      : undefined,
  }),
  signal: AbortSignal.timeout(15 * 60_000),
  onStep: async (message) => {
    process.stdout.write(message + "\n");
  },
});
process.stdout.write(`Live at ${live.url} (project ${live.projectId}).\n`);
