import "server-only";
import type * as MSSQL from "mssql";
import { likePattern, ValidationError } from "./api";
import { APPS, EMPLOYEE_FIELDS, EMPLOYEE_STATUSES, type App, type AppTrainingState, type EmployeeFieldKey } from "./types";

type Sql = typeof MSSQL;

export type EmployeeFields = Record<EmployeeFieldKey, string | null>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[0-9+()\-\s]+$/;

/**
 * Normalizes a date to "YYYY-MM-DD". Accepts ISO dates, Excel dates, and day-first dates
 * as written in the HR sheet ("01.08.2026", "03-08-2026", "3/8/2026").
 */
export function normalizeDate(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  let y: number, m: number, d: number;
  if (value instanceof Date) {
    // Excel date cells arrive as midnight UTC.
    [y, m, d] = [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()];
  } else if (typeof value === "number") {
    // Excel serial date (days since 1899-12-30).
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000);
    [y, m, d] = [date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate()];
  } else {
    const text = String(value).trim();
    let match = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/.exec(text);
    if (match) [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
    else if ((match = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(text))) [d, m, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
    else return "invalid";
  }
  const check = new Date(Date.UTC(y, m - 1, d));
  if (y < 1900 || y > 2200 || check.getUTCMonth() !== m - 1 || check.getUTCDate() !== d) return "invalid";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Validates one employee (from the form or an Excel row). Missing fields become null. */
export function parseEmployee(input: Record<string, unknown>): EmployeeFields {
  const result = {} as EmployeeFields;
  for (const field of EMPLOYEE_FIELDS) {
    const raw = input[field.key];
    const type = "type" in field ? field.type : "text";

    if (type === "date") {
      const date = normalizeDate(raw);
      if (date === "invalid") throw new ValidationError(`${field.label} is not a valid date (use DD.MM.YYYY).`);
      result[field.key] = date;
      continue;
    }

    let value = raw === null || raw === undefined ? "" : String(raw).trim().replace(/\s+/g, " ");
    if (type === "email") value = value.replace(/^mailto:/i, "").toLowerCase();
    if ("max" in field && value.length > field.max) throw new ValidationError(`${field.label} must be ${field.max} characters or fewer.`);
    if (value && type === "email" && !EMAIL_RE.test(value)) throw new ValidationError(`${field.label} "${value}" is not a valid email address.`);
    if (value && type === "phone" && !PHONE_RE.test(value)) throw new ValidationError(`${field.label} "${value}" may contain only digits, spaces, +, - and brackets.`);
    if (type === "status") {
      // Accept any casing ("active", "ACTIVE") and default to Active.
      const status = EMPLOYEE_STATUSES.find((s) => s.toLowerCase() === value.toLowerCase());
      if (value && !status) throw new ValidationError(`Status must be one of: ${EMPLOYEE_STATUSES.join(", ")}.`);
      value = status ?? "Active";
    }
    result[field.key] = value || null;
  }
  if (!result.DisplayName) throw new ValidationError("Display Name is required.");
  return result;
}

/** Adds every employee column as a parameter named after the column. */
export function addEmployeeInputs(sql: Sql, request: MSSQL.Request, f: EmployeeFields) {
  for (const field of EMPLOYEE_FIELDS) {
    const value = f[field.key];
    if ("type" in field && field.type === "date") request.input(field.key, sql.Date, value ? new Date(value) : null);
    else request.input(field.key, sql.NVarChar("max" in field ? field.max : 20), value);
  }
  return request;
}

const COLUMNS = EMPLOYEE_FIELDS.map((f) => f.key);
export const INSERT_EMPLOYEE_SQL = `
  INSERT INTO dbo.Employees (${COLUMNS.join(", ")})
  OUTPUT INSERTED.Id
  VALUES (${COLUMNS.map((c) => `@${c}`).join(", ")})`;
export const UPDATE_EMPLOYEE_SQL = `
  UPDATE dbo.Employees
  SET ${COLUMNS.map((c) => `${c} = @${c}`).join(", ")}, UpdatedAt = SYSUTCDATETIME()
  WHERE Id = @Id`;

/** True when SQL Server rejected a duplicate value in a unique index (the email). */
export function isDuplicateKey(err: unknown) {
  const n = (err as { number?: number })?.number;
  return n === 2601 || n === 2627;
}

// SQL string literal for a configured app name.
export const appLiteral = (app: App) => `N'${app.replace(/'/g, "''")}'`;

// Employee columns plus, per app in the master config (in APPS order), a training-state column Training_<n>
// and a Required_<n> flag (1 = the app was chosen for the joiner). withTraining turns them into
// `Training` and `TrainingApps`. Employees are aliased `e`;
// `tr.A<n>` is 2 = trained (completed session), 1 = scheduled, 0 = no session for APPS[n];
// `ra.R<n>` is 1 when APPS[n] is one of the joiner's training apps.
export const trainingColumn = (i: number) => `Training_${i}`;
export const requiredColumn = (i: number) => `Required_${i}`;
export const EMPLOYEE_SELECT = `
  SELECT e.Id, ${COLUMNS.map((c) => `e.${c}`).join(", ")}, e.CreatedAt, e.UpdatedAt,
         ${APPS.map(
           (_, i) =>
             `CASE COALESCE(tr.A${i}, 0) WHEN 2 THEN N'Trained' WHEN 1 THEN N'Scheduled' ELSE CASE WHEN ra.R${i} = 1 THEN N'Pending' ELSE N'Not required' END END AS ${trainingColumn(i)}, ` +
             `COALESCE(ra.R${i}, 0) AS ${requiredColumn(i)}`,
         ).join(", ")}
  FROM dbo.Employees e
  OUTER APPLY (
    SELECT ${APPS.map((app, i) => `MAX(CASE WHEN a.App = ${appLiteral(app)} THEN CASE s.Status WHEN N'Completed' THEN 2 WHEN N'Scheduled' THEN 1 ELSE 0 END ELSE 0 END) AS A${i}`).join(", ")}
    FROM dbo.TrainingAttendees a JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
    WHERE a.EmployeeId = e.Id
  ) tr
  OUTER APPLY (
    SELECT ${APPS.map((app, i) => `MAX(CASE WHEN r.App = ${appLiteral(app)} THEN 1 ELSE 0 END) AS R${i}`).join(", ")}
    FROM dbo.EmployeeTrainingApps r
    WHERE r.EmployeeId = e.Id
  ) ra`;

// Moves the Training_<n> / Required_<n> columns of an EMPLOYEE_SELECT row into
// `Training: { [app]: state }` and `TrainingApps: [app, ...]`.
export function withTraining<T extends Record<string, unknown>>(row: T) {
  const out: Record<string, unknown> = { ...row };
  const training = {} as Record<App, AppTrainingState>;
  const apps: App[] = [];
  APPS.forEach((app, i) => {
    training[app] = row[trainingColumn(i)] as AppTrainingState;
    if (row[requiredColumn(i)]) apps.push(app);
    delete out[trainingColumn(i)];
    delete out[requiredColumn(i)];
  });
  out.Training = training;
  out.TrainingApps = apps;
  return out;
}

/**
 * Reads the joiner's training apps from the form/sheet value: a list of app names or comma-separated text
 * ("HRMS, CRM"). Matching ignores case. Returns undefined when the value was left out (keep what is saved).
 */
export function parseTrainingApps(raw: unknown): App[] | undefined {
  if (raw === undefined) return undefined;
  if (raw === null) return [];
  const names = Array.isArray(raw) ? raw.map(String) : String(raw).split(/[,;/\n]+/);
  const chosen = new Set<App>();
  for (const name of names.map((n) => n.trim()).filter(Boolean)) {
    const app = APPS.find((a) => a.toLowerCase() === name.toLowerCase().replace(/\s+/g, " "));
    if (!app) throw new ValidationError(`"${name}" is not an app. Training apps must be from: ${APPS.join(", ")}.`);
    chosen.add(app);
  }
  return APPS.filter((a) => chosen.has(a));
}

/** Replaces the joiner's training apps. `request` must be on the same transaction/pool as the employee save. */
export async function saveTrainingApps(sql: Sql, request: MSSQL.Request, employeeId: number, apps: App[]) {
  request.input("EmployeeId", sql.Int, employeeId);
  apps.forEach((app, i) => request.input(`TrainingApp${i}`, sql.NVarChar(20), app));
  await request.query(`
    DELETE FROM dbo.EmployeeTrainingApps WHERE EmployeeId = @EmployeeId;
    ${apps.length ? `INSERT INTO dbo.EmployeeTrainingApps (EmployeeId, App) VALUES ${apps.map((_, i) => `(@EmployeeId, @TrainingApp${i})`).join(", ")};` : ""}
  `);
}

/**
 * WHERE/ORDER BY for the employee list from URL filters
 * (search, unit, department, status, training, from, to, sort), adding parameters to `req`.
 */
export function buildEmployeeFilter(sql: Sql, req: MSSQL.Request, params: URLSearchParams) {
  const where: string[] = [];

  const search = params.get("search")?.trim().slice(0, 200);
  if (search) {
    req.input("Search", sql.NVarChar(210), likePattern(search));
    where.push(
      "(" +
        ["DisplayName", "Email", "Designation", "Department", "ReportingTo", "BaseLocation", "MobilePersonal", "MobileOfficial"]
          .map((c) => `e.${c} LIKE @Search`)
          .join(" OR ") +
        ")",
    );
  }

  for (const column of ["Unit", "Department"] as const) {
    const value = params.get(column.toLowerCase())?.trim();
    if (value) {
      req.input(column, sql.NVarChar(100), value.slice(0, 100));
      where.push(`e.${column} = @${column}`);
    }
  }

  const status = params.get("status");
  if (status && (EMPLOYEE_STATUSES as readonly string[]).includes(status)) {
    req.input("Status", sql.NVarChar(20), status);
    where.push("e.Status = @Status");
  }

  // training=any-pending | fully-trained | pending:<app> | no-apps
  // Only the apps chosen for a joiner count: an app that isn't required is never "pending".
  const training = params.get("training") ?? "";
  const needs = (i: number) => `(COALESCE(ra.R${i}, 0) = 1 AND COALESCE(tr.A${i}, 0) <> 2)`;
  const anyRequired = `(${APPS.map((_, i) => `COALESCE(ra.R${i}, 0) = 1`).join(" OR ")})`;
  const anyNeeded = `(${APPS.map((_, i) => needs(i)).join(" OR ")})`;
  if (training === "any-pending") where.push(anyNeeded);
  else if (training === "fully-trained") where.push(`${anyRequired} AND NOT ${anyNeeded}`);
  else if (training === "no-apps") where.push(`NOT ${anyRequired}`);
  else if (training.startsWith("pending:")) {
    const i = (APPS as readonly string[]).indexOf(training.slice("pending:".length));
    if (i >= 0) where.push(needs(i));
  }

  // Date of joining range, as plain calendar days.
  const from = normalizeDate(params.get("from"));
  if (from && from !== "invalid") {
    req.input("From", sql.Date, new Date(from));
    where.push("e.DateOfJoining >= @From");
  }
  const to = normalizeDate(params.get("to"));
  if (to && to !== "invalid") {
    req.input("To", sql.Date, new Date(to));
    where.push("e.DateOfJoining <= @To");
  }

  const sort = params.get("sort");
  const orderSql =
    sort === "name" ? "ORDER BY e.DisplayName, e.Id" : sort === "oldest" ? "ORDER BY e.DateOfJoining ASC, e.Id ASC" : "ORDER BY e.DateOfJoining DESC, e.Id DESC";
  return { whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "", orderSql };
}
