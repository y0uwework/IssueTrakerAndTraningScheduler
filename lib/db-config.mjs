// SQL Server connection settings from environment variables.
// Shared by the app (lib/db.ts) and the migration runner (scripts/migrate.mjs).

function env(name, fallback) {
  const value = process.env[name]?.trim();
  if (value) return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing environment variable ${name}. Copy .env.local.example to .env.local and fill it in.`);
}

const bool = (name, fallback) => (process.env[name]?.trim() || String(fallback)).toLowerCase() === "true";

export const databaseName = () => env("DB_DATABASE", "IssueTrackerDB");

/**
 * Loads the right mssql driver and builds a pool config.
 * @param {{ database?: string, user?: string, password?: string }} [overrides]
 * @returns {Promise<{ sql: any, config: any }>}
 */
export async function loadDbConfig(overrides = {}) {
  const windowsAuth = env("DB_AUTH", "sql").toLowerCase() === "windows";
  const database = overrides.database ?? databaseName();
  const serverSetting = env("DB_SERVER", "localhost");
  const port = process.env.DB_PORT?.trim() ? Number(process.env.DB_PORT) : undefined;

  if (windowsAuth) {
    // Windows Authentication requires the optional native driver: npm install msnodesqlv8
    // plus a Microsoft ODBC Driver for SQL Server installed on this PC.
    const sql = (await import("mssql/msnodesqlv8")).default;
    const driver = env("DB_ODBC_DRIVER", "ODBC Driver 18 for SQL Server");
    const server = port ? `${serverSetting},${port}` : serverSetting;
    const yesNo = (v) => (v ? "yes" : "no");
    const connectionString =
      `Driver={${driver}};Server=${server};Database=${database};Trusted_Connection=yes;` +
      `Encrypt=${yesNo(bool("DB_ENCRYPT", false))};TrustServerCertificate=${yesNo(bool("DB_TRUST_SERVER_CERTIFICATE", true))};`;
    return { sql, config: { connectionString, server: serverSetting, database } };
  }

  const sql = (await import("mssql")).default;
  // DB_SERVER may be "localhost" or "localhost\SQLEXPRESS" (named instance, needs SQL Server Browser).
  // An explicit DB_PORT wins over the instance name and works without SQL Server Browser.
  const [server, namedInstance] = serverSetting.split("\\");
  const instanceName = port ? undefined : namedInstance;
  return {
    sql,
    config: {
      server,
      port: instanceName ? undefined : (port ?? 1433),
      database,
      user: overrides.user ?? env("DB_USER"),
      password: overrides.password ?? env("DB_PASSWORD"),
      pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
      options: {
        instanceName: instanceName || undefined,
        encrypt: bool("DB_ENCRYPT", false),
        trustServerCertificate: bool("DB_TRUST_SERVER_CERTIFICATE", true),
      },
    },
  };
}
