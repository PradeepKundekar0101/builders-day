import { z } from "zod";
import { SpecSchema, type Spec } from "@buildwise/shared";

export const DesignSchema = z
  .object({
    headline: z.string().min(1).max(140),
    description: z.string().min(1).max(600),
    accent: z.enum(["blue", "violet", "green", "orange"]),
    pages: z
      .array(z.object({ title: z.string().min(1).max(80), body: z.string().min(1).max(3000) }))
      .min(1)
      .max(12),
  })
  .strict();
export type Design = z.infer<typeof DesignSchema>;
export function supportedSpec(raw: unknown): Spec {
  const spec = SpecSchema.parse(raw);
  if (spec.integrations.length)
    throw new Error(
      "This worker supports pages and owner-scoped CRUD only. Remove external integrations before building.",
    );
  if (spec.auth.providers.some((p) => p !== "email"))
    throw new Error("Generated apps support email sign-in only.");
  if (spec.entities.length && !spec.auth.enabled)
    throw new Error("Data entities require email authentication.");
  if (
    spec.pages.length > 12 ||
    spec.entities.length > 8 ||
    spec.entities.some((e) => e.fields.length > 20)
  )
    throw new Error("Template scope exceeds 12 pages, 8 entities or 20 fields.");
  for (const e of spec.entities) {
    if (new Set(e.fields.map((f) => f.name)).size !== e.fields.length)
      throw new Error("Duplicate field names");
  }
  return spec;
}
export function validateDesign(spec: Spec, raw: unknown) {
  const design = DesignSchema.parse(raw);
  if (design.pages.length !== spec.pages.length)
    throw new Error("Design must cover every reviewed page.");
  return design;
}
/** Identifiers come only from the canonical schema, never model-produced SQL. */
export function migrationFor(raw: unknown) {
  const spec = supportedSpec(raw);
  const types: Record<string, string> = { number: "numeric", boolean: "boolean", date: "date" };
  return spec.entities
    .map(
      (e) => `create table public."${e.name}" (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 ${e.fields.map((f) => `"${f.name}" ${types[f.type] ?? "text"}${f.required ? " not null" : ""}`).join(",\n ")}
);
alter table public."${e.name}" enable row level security;
grant select, insert, update, delete on public."${e.name}" to authenticated;
create policy "owner reads" on public."${e.name}" for select to authenticated using (auth.uid()=user_id);
create policy "owner inserts" on public."${e.name}" for insert to authenticated with check (auth.uid()=user_id);
create policy "owner updates" on public."${e.name}" for update to authenticated using (auth.uid()=user_id) with check (auth.uid()=user_id);
create policy "owner deletes" on public."${e.name}" for delete to authenticated using (auth.uid()=user_id);
`,
    )
    .join("\n");
}
/** All user/model strings are JSON data; none are interpolated into executable JS/HTML. */
export function generatedFiles(raw: unknown, design: unknown): Record<string, string> {
  const spec = supportedSpec(raw);
  return {
    "product.json": JSON.stringify({ spec, design: validateDesign(spec, design) }, null, 2),
    "supabase/migrations/001_product.sql": migrationFor(spec),
  };
}
