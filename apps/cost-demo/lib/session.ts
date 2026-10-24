import { MemoryStore, CostGuard, CreditWallet, MemoryWalletStore } from "@buildwise/cost-guard";
export const store = new MemoryStore();
export const guard = new CostGuard(store);
export const wallet = new CreditWallet(new MemoryWalletStore());
// Local simulations only. No provider, payment, or Supabase calls.
