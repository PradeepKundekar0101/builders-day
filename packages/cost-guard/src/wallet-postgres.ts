import type { RpcClient } from "./index";
import type { WalletStore, WalletState, WalletCommand } from "./credits";
export class PostgresWalletStore implements WalletStore {
  constructor(private client: RpcClient) {}
  private async call(name: string, args: Record<string, unknown>) {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw new Error(error.message);
    return data;
  }
  async read(accountId: string) {
    return (await this.call("cost_wallet_read", { p_account_id: accountId })) as WalletState;
  }
  async compareAndSwap(version: number, next: WalletState, command: WalletCommand) {
    return (
      (await this.call("cost_wallet_cas", {
        p_account_id: next.accountId,
        p_expected_version: version,
        p_state: next,
        p_command: command,
      })) === true
    );
  }
}
