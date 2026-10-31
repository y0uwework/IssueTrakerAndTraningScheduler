// SQL Server migration runner.
//
//   npm run migrate                 apply all pending migrations (creates the database if missing)
//   npm run migrate:status          list applied / pending migrations
//   npm run migrate:new add_x_col   create database/migrations/NNNN_add_x_col.sql
//
// Migrations are .sql files in database/migrations, applied in file-name order. Each file runs
// in one transaction and is recorded in dbo.SchemaMigrations. Split batches with a "GO" line,
// as in SSMS. Never edit a migration that has been applied; add a new one instead.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { databaseName, loadDbConfig } from "../lib/db-config.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "database", "migrations");

// Same precedence as Next.js: .env.local wins over .env (already-set variables are kept).
for (const file of [".env.local", ".env"]) {
  const p = path.join(root, file);
  if (existsSync(p)) process.loadEnvFile(p);
}

const [command = "up", ...args] = process.argv.slice(2);

function listMigrations() {
  return readdirSync(dir)
    .filter((f) => /^\d{4}_[\w-]+\.sql$/.test(f))
    .sort()
    .map((name) => {
      const text = readFileSync(path.join(dir, name), "utf8").replace(/^﻿/, "").replace(/\r\n/g, "\n");
      return { name, text, checksum: createHash("sha256").update(text).digest("hex") };
    });
}

const splitBatches = (text) =>
  text
    .split(/^\s*GO\s*;?\s*$/gim)
    .map((b) => b.trim())
    .filter((b) => b && !/^(--[^\n]*\s*)+$/.test(b)); // skip comment-only batches

// Migrations can run as a more privileged login than the app (DDL rights needed).
const credentials = () => ({
  user: process.env.DB_MIGRATE_USER?.trim() || undefined,
  password: process.env.DB_MIGRATE_PASSWORD?.trim() || undefined,
});

async function connect(database) {
  const { sql, config } = await loadDbConfig({ database, ...credentials() });
  const pool = new sql.ConnectionPool({ ...config, pool: { max: 1, min: 0 }, requestTimeout: 300000 });
  await pool.connect();
  return { sql, pool };
}

async function ensureDatabase(name) {
  const { sql, pool } = await connect("master");
  try {
    const r = await pool.request().input("name", sql.NVarChar, name).query(`
      IF DB_ID(@name) IS NULL
      BEGIN
        DECLARE @stmt NVARCHAR(400) = N'CREATE DATABASE ' + QUOTENAME(@name);
        EXEC (@stmt);
        SELECT CAST(1 AS BIT) AS created;
      END
      ELSE SELECT CAST(0 AS BIT) AS created;`);
    if (r.recordset[0].created) console.log(`Created database ${name}`);
  } finally {
    await pool.close();
  }
}

async function ensureHistoryTable(pool) {
  await pool.request().batch(`
    IF OBJECT_ID(N'dbo.SchemaMigrations', N'U') IS NULL
      CREATE TABLE dbo.SchemaMigrations (
        Name      NVARCHAR(255) NOT NULL CONSTRAINT PK_SchemaMigrations PRIMARY KEY,
        Checksum  CHAR(64)      NOT NULL,
        AppliedAt DATETIME2     NOT NULL CONSTRAINT DF_SchemaMigrations_AppliedAt DEFAULT SYSUTCDATETIME()
      );`);
  const r = await pool.request().query("SELECT Name, Checksum, AppliedAt FROM dbo.SchemaMigrations");
  return new Map(r.recordset.map((row) => [row.Name, row]));
}

function checkEdited(migrations, applied) {
  const edited = migrations.filter((m) => applied.has(m.name) && applied.get(m.name).Checksum !== m.checksum);
  for (const m of edited) console.error(`  ! ${m.name} was changed after it was applied`);
  return edited.length > 0;
}

async function up() {
  const database = databaseName();
  await ensureDatabase(database);
  const { sql, pool } = await connect(database);
  try {
    // Stop two runs (e.g. two terminals) from applying the same migration at once.
    const lock = await pool.request().query(
      "DECLARE @r INT; EXEC @r = sp_getapplock @Resource = N'SchemaMigrations', @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = 30000; SELECT @r AS r;"
    );
    if (lock.recordset[0].r < 0) throw new Error("Another migration run is in progress.");

    const applied = await ensureHistoryTable(pool);
    const migrations = listMigrations();
    if (checkEdited(migrations, applied)) {
      throw new Error("Applied migrations must not be edited. Revert the change and add a new migration instead.");
    }

    const pending = migrations.filter((m) => !applied.has(m.name));
    if (pending.length === 0) {
      console.log(`${database} is up to date (${applied.size} migrations applied).`);
      return;
    }

    for (const m of pending) {
      process.stdout.write(`Applying ${m.name} ... `);
      const tx = new sql.Transaction(pool);
      await tx.begin();
      try {
        for (const batch of splitBatches(m.text)) await new sql.Request(tx).batch(batch);
        await new sql.Request(tx)
          .input("name", sql.NVarChar, m.name)
          .input("checksum", sql.Char(64), m.checksum)
          .query("INSERT INTO dbo.SchemaMigrations (Name, Checksum) VALUES (@name, @checksum)");
        await tx.commit();
        console.log("done");
      } catch (err) {
        console.log("FAILED");
        await tx.rollback().catch(() => {});
        throw new Error(`${m.name} failed and was rolled back: ${err.message}`);
      }
    }
    console.log(`Applied ${pending.length} migration(s) to ${database}.`);
  } finally {
    await pool.close();
  }
}

async function status() {
  const database = databaseName();
  const migrations = listMigrations();
  let applied = new Map();
  let pool;
  try {
    ({ pool } = await connect(database));
    const exists = await pool.request().query("SELECT OBJECT_ID(N'dbo.SchemaMigrations', N'U') AS id");
    if (exists.recordset[0].id) {
      const r = await pool.request().query("SELECT Name, Checksum, AppliedAt FROM dbo.SchemaMigrations");
      applied = new Map(r.recordset.map((row) => [row.Name, row]));
    }
  } catch (err) {
    if (!/Cannot open database|Login failed for user .* database/i.test(err.message)) throw err;
    console.log(`Database ${database} does not exist yet.`);
  } finally {
    await pool?.close();
  }

  console.log(`Migrations for ${database}:`);
  for (const m of migrations) {
    const row = applied.get(m.name);
    const state = !row ? "pending" : row.Checksum !== m.checksum ? "EDITED " : "applied";
    console.log(`  [${state}] ${m.name}${row ? `  (${row.AppliedAt.toISOString()})` : ""}`);
  }
  for (const name of applied.keys()) {
    if (!migrations.some((m) => m.name === name)) console.log(`  [missing] ${name} (applied, but the file is gone)`);
  }
}

function create(nameArg) {
  const slug = (nameArg ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!slug) throw new Error("Usage: npm run migrate:new <name>   e.g. npm run migrate:new add_issue_due_date");
  const last = listMigrations().at(-1);
  const next = String((last ? Number(last.name.slice(0, 4)) : 0) + 1).padStart(4, "0");
  const file = path.join(dir, `${next}_${slug}.sql`);
  writeFileSync(
    file,
    `-- ${slug.replace(/_/g, " ")}\n-- Runs in one transaction. Separate batches with a line containing only GO.\n\n\n`
  );
  console.log(`Created ${path.relative(root, file)}`);
}

try {
  if (command === "up") await up();
  else if (command === "status") await status();
  else if (command === "new") create(args.join("_"));
  else throw new Error(`Unknown command "${command}". Use: up | status | new <name>`);
} catch (err) {
  console.error(`\n${err.message}`);
  process.exitCode = 1;
}
