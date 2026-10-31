import "server-only";
import type * as MSSQL from "mssql";
import { loadDbConfig } from "./db-config.mjs";

type Sql = typeof MSSQL;

// Keep the pool on globalThis so Next.js hot reloads in development reuse it.
const globalForDb = globalThis as unknown as {
  issueTrackerDb?: Promise<{ sql: Sql; pool: MSSQL.ConnectionPool }>;
};

// The schema is managed by migrations in database/migrations (run: npm run migrate).
async function connect() {
  const { sql, config } = (await loadDbConfig()) as { sql: Sql; config: MSSQL.config };
  const pool = new sql.ConnectionPool(config);
  await pool.connect();
  return { sql, pool };
}

export function getDb() {
  if (!globalForDb.issueTrackerDb) {
    globalForDb.issueTrackerDb = connect().catch((err) => {
      // Allow the next request to retry instead of caching the failure.
      globalForDb.issueTrackerDb = undefined;
      throw err;
    });
  }
  return globalForDb.issueTrackerDb;
}
