import "server-only";
import type * as MSSQL from "mssql";

type Sql = typeof MSSQL;

// Keep the pool on globalThis so Next.js hot reloads in development reuse it.
const globalForDb = globalThis as unknown as {
  issueTrackerDb?: Promise<{ sql: Sql; pool: MSSQL.ConnectionPool }>;
};

function env(name: string, fallback?: string): string {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`);
}

const bool = (name: string, fallback: boolean) => (process.env[name]?.trim() || String(fallback)).toLowerCase() === "true";

async function connect() {
  const windowsAuth = env("DB_AUTH", "sql").toLowerCase() === "windows";
  const database = env("DB_DATABASE", "IssueTrackerDB");
  const serverSetting = env("DB_SERVER", "localhost");
  const port = process.env.DB_PORT?.trim() ? Number(process.env.DB_PORT) : undefined;

  if (windowsAuth) {
    // Windows Authentication requires the optional native driver: npm install msnodesqlv8
    // plus a Microsoft ODBC Driver for SQL Server installed on this PC.
    const sql = ((await import("mssql/msnodesqlv8")) as unknown as { default: Sql }).default;
    const driver = env("DB_ODBC_DRIVER", "ODBC Driver 18 for SQL Server");
    const server = port ? `${serverSetting},${port}` : serverSetting;
    const yesNo = (v: boolean) => (v ? "yes" : "no");
    const connectionString =
      `Driver={${driver}};Server=${server};Database=${database};Trusted_Connection=yes;` +
      `Encrypt=${yesNo(bool("DB_ENCRYPT", false))};TrustServerCertificate=${yesNo(bool("DB_TRUST_SERVER_CERTIFICATE", true))};`;
    const pool = new sql.ConnectionPool({ connectionString, server: serverSetting, database } as MSSQL.config);
    await pool.connect();
    return { sql, pool };
  }

  const sql = (await import("mssql")).default as unknown as Sql;
  // DB_SERVER may be "localhost" or "localhost\SQLEXPRESS" (named instance, needs SQL Server Browser).
  // An explicit DB_PORT wins over the instance name and works without SQL Server Browser.
  const [server, namedInstance] = serverSetting.split("\\");
  const instanceName = port ? undefined : namedInstance;
  const pool = new sql.ConnectionPool({
    server,
    port: instanceName ? undefined : (port ?? 1433),
    database,
    user: env("DB_USER"),
    password: env("DB_PASSWORD"),
    pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
    options: {
      instanceName: instanceName || undefined,
      encrypt: bool("DB_ENCRYPT", false),
      trustServerCertificate: bool("DB_TRUST_SERVER_CERTIFICATE", true),
    },
  });
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
