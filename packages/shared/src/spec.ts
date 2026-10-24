import { z } from "zod";

/** Entity and field names become table and column names in generated apps. */
const identifier = z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "must be a snake_case identifier");

const RESERVED_FIELD_NAMES = new Set(["id", "user_id", "created_at"]);

export const FIELD_TYPES = [
  "text",
  "long_text",
  "number",
  "boolean",
  "date",
  "email",
  "url",
  "image",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const INTEGRATION_KINDS = [
  "file_upload",
  "payment_pinelabs",
  "email",
  "ai_feature",
  "admin_dashboard",
] as const;
export type IntegrationKind = (typeof INTEGRATION_KINDS)[number];

const FieldSchema = z.object({
  name: identifier.refine((n) => !RESERVED_FIELD_NAMES.has(n), "is reserved"),
  type: z.enum(FIELD_TYPES),
  required: z.boolean(),
});

const EntitySchema = z.object({
  name: identifier,
  fields: z.array(FieldSchema).min(1),
  ownerScoped: z.literal(true),
  mustHave: z.boolean(),
});

export const SpecSchema = z
  .object({
    name: z.string().min(1).max(60),
    summary: z.string().min(1).max(500),
    pages: z
      .array(z.object({ name: z.string().min(1), purpose: z.string().min(1), mustHave: z.boolean() }))
      .min(1),
    entities: z.array(EntitySchema),
    auth: z.object({
      enabled: z.boolean(),
      providers: z.array(z.enum(["email", "google"])),
    }),
    integrations: z.array(
      z.object({
        kind: z.enum(INTEGRATION_KINDS),
        mustHave: z.boolean(),
        notes: z.string().optional(),
      }),
    ),
    sampleData: z.string().max(10_000).optional(),
  })
  .superRefine((spec, ctx) => {
    const seen = new Set<string>();
    spec.entities.forEach((entity, i) => {
      if (seen.has(entity.name)) {
        ctx.addIssue({ code: "custom", path: ["entities", i, "name"], message: "duplicate entity name" });
      }
      seen.add(entity.name);
    });
    if (spec.auth.enabled && spec.auth.providers.length === 0) {
      ctx.addIssue({ code: "custom", path: ["auth", "providers"], message: "required when auth is enabled" });
    }
  });

export type Spec = z.infer<typeof SpecSchema>;
