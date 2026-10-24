import { it, expect, vi } from "vitest";
import { requestDesign, planRequest } from "./provider";
import { supportedSpec } from "@buildwise/build-engine";
const spec = supportedSpec({
  name: "Site",
  summary: "A site",
  pages: [{ name: "Home", purpose: "Welcome", mustHave: true }],
  entities: [],
  auth: { enabled: false, providers: [] },
  integrations: [],
});
const config = {
  apiKey: "test-only",
  model: "configured-model",
  inputRate: 1,
  outputRate: 2,
  pricingVersion: "test",
};
it("settles measurable usage even when the returned design is invalid", async () => {
  const fetcher = vi.fn().mockResolvedValue(
    Response.json({
      status: "completed",
      output: [{ content: [{ type: "output_text", text: "not JSON" }] }],
      usage: { input_tokens: 100, output_tokens: 50 },
    }),
  );
  const result = await requestDesign(spec, config, new AbortController().signal, fetcher);
  expect(result.actualMicros).toBe(200);
  expect(result.value.text).toBe("not JSON");
  const body = JSON.parse(fetcher.mock.calls[0]![1].body);
  expect(body.store).toBe(false);
  expect(body.max_output_tokens).toBe(3000);
  expect(body.tools).toBeUndefined();
  expect(planRequest(spec).inputBound).toBeGreaterThan(4096);
});
it("does not fabricate usage or retry after provider uncertainty", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("", { status: 503 }));
  await expect(requestDesign(spec, config, new AbortController().signal, fetcher)).rejects.toThrow(
    "uncertain",
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it("rejects missing usage rather than assuming a free call", async () => {
  const fetcher = vi.fn().mockResolvedValue(Response.json({ status: "completed", output: [] }));
  await expect(
    requestDesign(spec, config, new AbortController().signal, fetcher),
  ).rejects.toThrow();
});
