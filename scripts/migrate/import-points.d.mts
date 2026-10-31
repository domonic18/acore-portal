import type { Pool } from "mysql2/promise";

export declare function importPoints(pool: Pool): Promise<{
  imported: number;
  skippedNoUser: number;
  perRef: Record<string, number>;
}>;

export declare function reconcileD7(
  pool: Pool,
  opts?: { runTag?: string },
): Promise<{
  adjustedUsers: number;
  totalAdjust: number;
  differences: number;
}>;

export declare function ensurePointAccounts(pool: Pool): Promise<{
  accountsUpserted: number;
  accountsTotal: number;
}>;
