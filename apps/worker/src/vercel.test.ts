import { it, expect, vi } from "vitest";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deployableFiles, deployToVercel, projectName } from "./vercel";
async function product() {
  const dir = await mkdtemp(join(tmpdir(), "provn-vercel-"));
  for (const [file, body] of Object.entries({
    "package.json": "{}",
    "app/page.tsx": "export default 1",
    ".env.local": "SECRET=1",
    "node_modules/x/index.js": "x",
    ".next/build": "x",
    "product.zip": "zip",
  })) {
    await mkdir(join(dir, file, ".."), { recursive: true });
    await writeFile(join(dir, file), body);
  }
  return dir;
}
function fakeVercel(states: string[], project = 201) {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetcher = vi.fn(async (url: string, init: RequestInit = {}) => {
    calls.push({ url, init });
    const path = new URL(url).pathname;
    if (path === "/v11/projects")
      return project === 409
        ? Response.json({ error: { message: "exists" } }, { status: 409 })
        : Response.json({ id: "prj_new" });
    if (path.startsWith("/v9/projects/")) return Response.json({ id: "prj_old" });
    if (path.includes("/env")) return Response.json({});
    if (path === "/v2/files") return Response.json({});
    const readyState = states.shift() ?? "READY";
    return Response.json({
      id: "dpl_1",
      url: "bw-abc-123.vercel.app",
      readyState,
      alias: readyState === "READY" ? ["bw-abc.vercel.app"] : [],
      errorMessage: readyState === "ERROR" ? "Build failed" : null,
    });
  });
  return { calls, fetcher: fetcher as unknown as typeof fetch };
}
const config = {
  token: "test-only",
  teamId: "team_1",
  embedOrigin: "https://getbuildwise.vercel.app",
};
it("never uploads secrets, dependencies, build output or the archive", async () => {
  const files = (await deployableFiles(await product())).map((f) => f.file);
  expect(files).toEqual(["app/page.tsx", "package.json"]);
});
it("names one project per build", () => {
  expect(projectName("3F2A9B10-aaaa-bbbb")).toBe("bw-3f2a9b10aaaa");
});
it("creates a public project, uploads by sha, deploys to production and waits for READY", async () => {
  const { calls, fetcher } = fakeVercel(["QUEUED", "BUILDING", "READY"]);
  const result = await deployToVercel({
    directory: await product(),
    name: "bw-abc",
    config,
    signal: new AbortController().signal,
    fetcher,
    pollMs: 1,
  });
  expect(result).toEqual({
    url: "https://bw-abc.vercel.app",
    deploymentId: "dpl_1",
    projectId: "prj_new",
  });
  const create = JSON.parse(String(calls[0]!.init.body));
  expect(create.ssoProtection).toBeNull();
  expect(create.environmentVariables).toEqual([
    expect.objectContaining({
      key: "PROVN_EMBED_ORIGIN",
      value: "https://getbuildwise.vercel.app",
    }),
  ]);
  expect(calls.every((c) => c.url.includes("teamId=team_1"))).toBe(true);
  expect(calls.filter((c) => c.url.includes("/v2/files"))).toHaveLength(2);
  const deploy = calls.find((c) => c.url.includes("/v13/deployments?"))!;
  const body = JSON.parse(String(deploy.init.body));
  expect(body.target).toBe("production");
  expect(body.files.map((f: { file: string }) => f.file)).toEqual(["app/page.tsx", "package.json"]);
  expect(body.files[0].sha).toMatch(/^[a-f0-9]{40}$/);
  expect(JSON.stringify(calls.map((c) => c.init.body))).not.toContain("SECRET");
});
it("reuses the project of a retried build", async () => {
  const { calls, fetcher } = fakeVercel(["READY"], 409);
  const result = await deployToVercel({
    directory: await product(),
    name: "bw-abc",
    config,
    signal: new AbortController().signal,
    fetcher,
    pollMs: 1,
  });
  expect(result.projectId).toBe("prj_old");
  expect(
    calls.some((c) => c.url.includes("/v10/projects/prj_old/env?upsert=true&teamId=team_1")),
  ).toBe(true);
});
it("accepts a team slug", async () => {
  const { calls, fetcher } = fakeVercel(["READY"]);
  await deployToVercel({
    directory: await product(),
    name: "bw-abc",
    config: { token: "t", teamId: "conch-s-team" },
    signal: new AbortController().signal,
    fetcher,
    pollMs: 1,
  });
  expect(calls.every((c) => c.url.includes("slug=conch-s-team"))).toBe(true);
});
it("reports a failed Vercel build", async () => {
  const { fetcher } = fakeVercel(["BUILDING", "ERROR"]);
  await expect(
    deployToVercel({
      directory: await product(),
      name: "bw-abc",
      config,
      signal: new AbortController().signal,
      fetcher,
      pollMs: 1,
    }),
  ).rejects.toThrow("Build failed");
});
