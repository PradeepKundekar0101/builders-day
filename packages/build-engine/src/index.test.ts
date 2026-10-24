import { describe, it, expect } from "vitest";
import { supportedSpec, generatedFiles, migrationFor, validateDesign } from "./index";
const spec = {
  name: "Tasks",
  summary: "Private tasks",
  pages: [{ name: "Home", purpose: "Welcome", mustHave: true }],
  entities: [
    {
      name: "tasks",
      mustHave: true,
      ownerScoped: true,
      fields: [{ name: "title", type: "text", required: true }],
    },
  ],
  auth: { enabled: true, providers: ["email"] },
  integrations: [],
};
const design = {
  headline: "Tasks",
  description: "Organize work",
  accent: "blue",
  pages: [{ title: "Home", body: "<script>alert(1)</script>" }],
};
describe("build scope and generated data", () => {
  it("rejects integrations, Google and unowned data scope", () => {
    expect(() =>
      supportedSpec({ ...spec, integrations: [{ kind: "email", mustHave: true }] }),
    ).toThrow();
    expect(() =>
      supportedSpec({ ...spec, auth: { enabled: true, providers: ["google"] } }),
    ).toThrow();
    expect(() => supportedSpec({ ...spec, auth: { enabled: false, providers: [] } })).toThrow();
  });
  it("rejects SQL/path identifiers and duplicate fields", () => {
    expect(() =>
      supportedSpec({ ...spec, entities: [{ ...spec.entities[0], name: "../escape" }] }),
    ).toThrow();
    expect(() =>
      supportedSpec({
        ...spec,
        entities: [
          {
            ...spec.entities[0],
            fields: [...spec.entities[0]!.fields, ...spec.entities[0]!.fields],
          },
        ],
      }),
    ).toThrow();
  });
  it("keeps model output as JSON and enforces complete page coverage", () => {
    const files = generatedFiles(spec, design);
    expect(Object.keys(files)).toEqual(["product.json", "supabase/migrations/001_product.sql"]);
    expect(JSON.parse(files["product.json"]!).design.pages[0].body).toContain("<script>");
    expect(() => validateDesign(supportedSpec(spec), { ...design, pages: [] })).toThrow();
  });
  it("emits all owner RLS policies", () => {
    const sql = migrationFor(spec);
    expect(sql).toContain("enable row level security");
    expect(sql.match(/auth.uid\(\)=user_id/g)).toHaveLength(5);
  });
});
