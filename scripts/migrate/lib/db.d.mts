import type { Connection, Pool } from "mysql2/promise";

export declare const DEFAULT_SOURCE_SCHEMA: string;

export declare function loadEnv(): string;

export declare function resolveDbUrl(): string;

export declare function targetSchema(url?: string): string;

export declare function sourceSchema(): string;

export declare function rewriteSql(sql: string): string;

export declare function createPool(options?: {
  connectionLimit?: number;
  charset?: string;
  timezone?: string;
  multipleStatements?: boolean;
}): Pool;

export declare function createConnection(options?: {
  connectionLimit?: number;
  charset?: string;
  timezone?: string;
  multipleStatements?: boolean;
}): Promise<Connection>;

export declare function runSqlFile(
  sql: string,
  options?: {
    connectionLimit?: number;
    charset?: string;
    timezone?: string;
    multipleStatements?: boolean;
  },
): Promise<unknown>;
