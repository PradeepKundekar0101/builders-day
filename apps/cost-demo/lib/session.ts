import { MemoryStore, CostGuard } from "@buildwise/cost-guard";
export const store = new MemoryStore();
export const guard = new CostGuard(store);
// This app is a local simulation. No Supabase, provider calls, or payment processing.
