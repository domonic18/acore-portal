export declare function wpPreHash(password: string, trim?: boolean): string;

export declare function hashWpPassword(password: string, cost?: number): Promise<string>;

export declare function ensureAdmin(
  pool: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  opts: { username?: string; password?: string; email?: string },
): Promise<{ created: boolean; username: string | null }>;
