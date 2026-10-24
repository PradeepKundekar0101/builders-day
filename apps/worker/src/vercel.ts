import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { z } from "zod";
const API = "https://api.vercel.com";
export const VercelConfig = z.object({
  token: z.string().min(1),
  teamId: z.string().min(1).optional(),
  /** Exact https origin allowed to embed deployed apps (the PROVN site), e.g. https://getbuildwise.vercel.app */
  embedOrigin: z
    .string()
    .regex(/^https:\/\/[a-z0-9.-]+(:\d+)?$/i, "Use an exact https origin")
    .optional(),
});
export type VercelConfig = z.infer<typeof VercelConfig>;
const SKIP = new Set(["node_modules", ".next", "product.zip", ".git"]);
export async function deployableFiles(directory: string) {
  const files: { file: string; data: Buffer }[] = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (SKIP.has(entry.name) || entry.name.startsWith(".env")) continue;
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile())
        files.push({
          file: relative(directory, path).split(sep).join("/"),
          data: await readFile(path),
        });
    }
  }
  await walk(directory);
  return files.sort((a, b) => a.file.localeCompare(b.file));
}
/** Vercel project names: lowercase, max 100 chars. One project per build. */
export function projectName(buildId: string) {
  return `bw-${buildId
    .replace(/[^a-z0-9]/gi, "")
    .toLowerCase()
    .slice(0, 12)}`;
}
const Deployment = z.object({
  id: z.string(),
  url: z.string(),
  readyState: z.string(),
  alias: z.array(z.string()).optional(),
  errorMessage: z.string().nullish(),
});
export async function deployToVercel(input: {
  directory: string;
  name: string;
  config: VercelConfig;
  signal: AbortSignal;
  onStep?: (message: string) => Promise<void>;
  fetcher?: typeof fetch;
  pollMs?: number;
}) {
  const config = VercelConfig.parse(input.config),
    fetcher = input.fetcher ?? fetch;
  // VERCEL_TEAM_ID may be a team id (team_...) or a team slug.
  const qs = config.teamId
    ? `?${config.teamId.startsWith("team_") ? "teamId" : "slug"}=${encodeURIComponent(config.teamId)}`
    : "";
  async function call(path: string, init: RequestInit & { allow?: number[] } = {}) {
    const response = await fetcher(
      `${API}${path}${path.includes("?") ? qs.replace("?", "&") : qs}`,
      {
        ...init,
        signal: input.signal,
        headers: { Authorization: `Bearer ${config.token}`, ...init.headers },
      },
    );
    if (!response.ok && !init.allow?.includes(response.status)) {
      const body = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new Error(
        `Vercel ${init.method ?? "GET"} ${path.split("?")[0]} failed (${response.status}): ${body.error?.message ?? "no detail"}`,
      );
    }
    return response;
  }
  const json = (body: unknown) => ({
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const env = config.embedOrigin
    ? [
        {
          key: "PROVN_EMBED_ORIGIN",
          value: config.embedOrigin,
          target: ["production", "preview"],
          type: "plain",
        },
      ]
    : [];
  // Generated apps are public sites; Vercel Authentication would block visitors and the Studio iframe.
  const created = await call("/v11/projects", {
    ...json({
      name: input.name,
      framework: "nextjs",
      installCommand: "npm ci --ignore-scripts --no-audit --no-fund",
      buildCommand: "npm run build",
      environmentVariables: env,
      ssoProtection: null,
    }),
    allow: [409],
  });
  const project = z.object({ id: z.string() });
  let projectId: string;
  if (created.status === 409) {
    // A retried build reuses its project; refresh the embed origin in case it changed.
    projectId = project.parse(
      await (await call(`/v9/projects/${encodeURIComponent(input.name)}`)).json(),
    ).id;
    if (env.length) await call(`/v10/projects/${projectId}/env?upsert=true`, json(env));
  } else projectId = project.parse(await created.json()).id;
  const files = await deployableFiles(input.directory);
  await input.onStep?.(`Uploading ${files.length} files to Vercel.`);
  const refs = [];
  for (const f of files) {
    const sha = createHash("sha1").update(f.data).digest("hex");
    await call("/v2/files", {
      method: "POST",
      headers: {
        "Content-Type": "application/octet-stream",
        "x-vercel-digest": sha,
        "Content-Length": String(f.data.length),
      },
      body: new Uint8Array(f.data),
    });
    refs.push({ file: f.file, sha, size: f.data.length });
  }
  let deployment = Deployment.parse(
    await (
      await call("/v13/deployments?skipAutoDetectionConfirmation=1", {
        ...json({ name: input.name, project: input.name, target: "production", files: refs }),
      })
    ).json(),
  );
  await input.onStep?.("Vercel is building the app.");
  while (!["READY", "ERROR", "CANCELED"].includes(deployment.readyState)) {
    await delay(input.pollMs ?? 5000, undefined, { signal: input.signal });
    deployment = Deployment.parse(
      await (await call(`/v13/deployments/${encodeURIComponent(deployment.id)}`)).json(),
    );
  }
  if (deployment.readyState !== "READY")
    throw new Error(
      `Vercel deployment ${deployment.readyState}: ${deployment.errorMessage ?? "see Vercel build logs"}`,
    );
  // Prefer the stable production alias (<project>.vercel.app) over the per-deployment URL.
  const host =
    deployment.alias?.find((a) => a === `${input.name}.vercel.app`) ??
    deployment.alias?.[0] ??
    deployment.url;
  return { url: `https://${host}`, deploymentId: deployment.id, projectId };
}
