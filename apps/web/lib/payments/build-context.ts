import { z } from "zod";
export const buildContextSchema = z.object({
  session: z.string().uuid(),
  revision: z.number().int().positive().max(2147483647),
});
export type BuildContext = z.infer<typeof buildContextSchema>;
export function readBuildContext(params: { get(key: string): string | null }): BuildContext | null {
  const parsed = buildContextSchema.safeParse({
    session: params.get("session"),
    revision: Number(params.get("revision")),
  });
  return parsed.success ? parsed.data : null;
}
export function buildReturnUrl(context: BuildContext) {
  const valid = buildContextSchema.parse(context);
  return `/apps/build?${new URLSearchParams({ session: valid.session, revision: String(valid.revision), resume: "1" })}`;
}
export function topupAmount(required: number, available: number) {
  if (!Number.isFinite(required) || !Number.isFinite(available) || required < 0 || available < 0)
    throw new Error("Invalid balance");
  return Math.min(10000, Math.max(100, Math.ceil(required - available)));
}
export function checkoutUrl(context: BuildContext, required: number, available: number) {
  const valid = buildContextSchema.parse(context);
  return `/credits?${new URLSearchParams({ session: valid.session, revision: String(valid.revision), amount: String(topupAmount(required, available)) })}`;
}
