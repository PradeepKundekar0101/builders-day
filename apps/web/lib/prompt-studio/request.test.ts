import { describe, it, expect } from "vitest";
import { requireStudioOrigin, readStudioJson } from "./request";
const request = (body: string, type = "application/json") =>
  new Request("https://conduit.test/api", {
    method: "POST",
    headers: { "content-type": type },
    body,
  });
describe("Studio request boundary", () => {
  it("accepts only the configured browser origin", () => {
    expect(() =>
      requireStudioOrigin(
        new Request("https://conduit.test", { headers: { origin: "https://evil.test" } }),
        "https://conduit.test",
      ),
    ).toThrow();
    expect(() =>
      requireStudioOrigin(new Request("https://conduit.test"), "https://conduit.test"),
    ).toThrow();
    expect(() =>
      requireStudioOrigin(
        new Request("https://conduit.test", { headers: { origin: "https://conduit.test" } }),
        "https://conduit.test/",
      ),
    ).not.toThrow();
  });
  it("rejects malformed and non-JSON bodies", async () => {
    await expect(readStudioJson(request("{"))).rejects.toMatchObject({ status: 400 });
    await expect(readStudioJson(request("{}", "text/plain"))).rejects.toMatchObject({
      status: 415,
    });
  });
  it("caps actual bytes without trusting Content-Length", async () => {
    await expect(readStudioJson(request(JSON.stringify("é".repeat(33000))))).rejects.toMatchObject({
      status: 413,
    });
    await expect(readStudioJson(request('{"safe":true}'))).resolves.toEqual({ safe: true });
  });
});
