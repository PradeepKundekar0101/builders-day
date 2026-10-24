import type { Spec } from "./spec";

const INTEGRATION_LABELS: Record<Spec["integrations"][number]["kind"], string> = {
  file_upload: "File uploads",
  payment_pinelabs: "Payments",
  email: "Sending email",
  ai_feature: "AI features",
  admin_dashboard: "An admin or owner dashboard across all users' data",
};

export const BUILD_LIMITS = { pages: 12, entities: 8, fields: 20 } as const;

/** What the automated builder can make today, written for the intake model's instructions. */
export const BUILD_SCOPE_RULES = `The automated builder supports only: up to ${BUILD_LIMITS.pages} pages; email magic-link sign-in; and up to ${BUILD_LIMITS.entities} data entities (each up to ${BUILD_LIMITS.fields} fields) that are owner-scoped, meaning every signed-in user creates, sees, edits and deletes only their own records. It cannot build integrations (file uploads, payments, sending email, AI features, admin or owner dashboards), Google sign-in, data shared between users, public submissions from visitors who are not signed in, or one role seeing another user's records. Always set integrations to []. Use only email sign-in, and enable it whenever there are entities. When the idea needs something unsupported, design the closest supported version (for example, each client signs in and manages their own bookings) and state the trade-off in assumptions.`;

/** Reasons a spec cannot be built, in plain language; empty when it is within scope. */
export function buildScopeIssues(spec: Spec): string[] {
  const issues: string[] = [];
  for (const integration of spec.integrations)
    issues.push(
      `${INTEGRATION_LABELS[integration.kind]} (integration "${integration.kind}") is not supported yet.`,
    );
  if (spec.auth.providers.some((p) => p !== "email"))
    issues.push("Only email sign-in is supported. Remove other sign-in providers.");
  if (spec.entities.length && !spec.auth.enabled)
    issues.push("Data entities need email sign-in. Turn on authentication.");
  if (spec.pages.length > BUILD_LIMITS.pages)
    issues.push(
      `At most ${BUILD_LIMITS.pages} pages are supported (this brief has ${spec.pages.length}).`,
    );
  if (spec.entities.length > BUILD_LIMITS.entities)
    issues.push(
      `At most ${BUILD_LIMITS.entities} data entities are supported (this brief has ${spec.entities.length}).`,
    );
  for (const entity of spec.entities) {
    if (entity.fields.length > BUILD_LIMITS.fields)
      issues.push(
        `"${entity.name}" has ${entity.fields.length} fields; at most ${BUILD_LIMITS.fields} are supported.`,
      );
    if (new Set(entity.fields.map((f) => f.name)).size !== entity.fields.length)
      issues.push(`"${entity.name}" has duplicate field names.`);
  }
  return issues;
}
