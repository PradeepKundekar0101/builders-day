import { z } from "zod";
import { PromptStudioDraftSchema } from "@buildwise/shared";

const Profile = z.object({
  persona: z.enum(["non-tech", "indie", "team"]),
  mode: z.enum(["plain", "dev"]),
  budgetCap: z.number().finite().nonnegative(),
  approvalThreshold: z.number().finite().nonnegative(),
  privateMode: z.boolean(),
  plan: z.enum(["free", "builder", "pro", "team"]),
  byok: z.boolean(),
});
export const HandoffSchema = z.object({
  version: z.literal(1),
  createdAt: z.number().finite(),
  idea: z.string().max(2000),
  draft: PromptStudioDraftSchema.nullable(),
  pendingMessage: z.string().max(20000).default(""),
  specText: z.string().max(500000),
  profile: Profile,
  onboarded: z.boolean(),
  tab: z.enum(["brief", "prompt", "schema"]),
});
export type StudioHandoff = z.infer<typeof HandoffSchema>;
const prefix = "provn:studio-signin:";
export function handoffKey(id: string) {
  return prefix + z.string().uuid().parse(id);
}
export function writeHandoff(storage: Pick<Storage, "setItem">, id: string, value: StudioHandoff) {
  storage.setItem(handoffKey(id), JSON.stringify(HandoffSchema.parse(value)));
}
export function readHandoff(
  storage: Pick<Storage, "getItem" | "removeItem">,
  id: string,
  now = Date.now(),
) {
  const key = handoffKey(id),
    raw = storage.getItem(key);
  if (!raw)
    throw new Error(
      "Draft not found in this browser. Open the link in the browser where you started your draft.",
    );
  const value = HandoffSchema.parse(JSON.parse(raw));
  if (now - value.createdAt > 24 * 60 * 60 * 1000 || value.createdAt > now + 60000) {
    storage.removeItem(key);
    throw new Error("This local draft recovery link has expired.");
  }
  return value;
}
export function studioSignInPath(id: string) {
  handoffKey(id);
  return `/signin?next=${encodeURIComponent(`/apps/new?resume=${id}`)}`;
}
