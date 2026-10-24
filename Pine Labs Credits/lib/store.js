// Tiny JSON-file store for the local app. The platform swaps this for Supabase (see README).
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const empty = () => ({ users: {}, links: {}, ledger: [], webhooks: [] });

export function createFileStore(file) {
  let db = empty();
  if (file && existsSync(file)) db = { ...empty(), ...JSON.parse(readFileSync(file, "utf8")) };

  function save() {
    if (!file) return;
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file + ".tmp", JSON.stringify(db, null, 2));
    renameSync(file + ".tmp", file);
  }

  return {
    /** All mutations go through here so each one is written to disk atomically. */
    tx(fn) {
      const result = fn(db);
      save();
      return result;
    },
    read: () => db,
  };
}
