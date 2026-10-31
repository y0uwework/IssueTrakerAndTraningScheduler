import "server-only";
import ExcelJS from "exceljs";
import { getDb } from "./db";
import { ValidationError } from "./api";
import { cellValue } from "./employeeExcel";
import { INSERT_EMPLOYEE_SQL, addEmployeeInputs, parseEmployee } from "./employees";
import { APPS, MAX_TRAINERS, TRAINERS, TRAINING_MODES, findTrainer, type App, type LegacyTrainingImportResult, type LegacyTrainingRow, type TrainingMode } from "./types";

/*
  Import of the old training sheet that was kept by hand before this app existed.
  Its columns: User name, User Email, reporting manager, designation, official, personal, location,
  info get on (training date), traning time ("02:48 - 03:29"), traning status (apps: "CRM", "HRMS , CRM"),
  MODE OF TRAINING (online / offline / F2F). Rows are reviewed in the browser before they are saved.
*/

export const MAX_LEGACY_ROWS = 2000;

type Column = "name" | "email" | "reportingTo" | "designation" | "mobileOfficial" | "mobilePersonal" | "location" | "date" | "time" | "apps" | "mode";

const normalize = (header: string) =>
  header
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim()
    .replace(/\bTRANING\b/g, "TRAINING");

const HEADERS: Record<string, Column> = {
  "USER NAME": "name",
  NAME: "name",
  "EMPLOYEE NAME": "name",
  "DISPLAY NAME": "name",
  "USER EMAIL": "email",
  "USER EMAIL ID": "email",
  EMAIL: "email",
  "EMAIL ID": "email",
  "REPORTING MANAGER": "reportingTo",
  "REPORTING TO": "reportingTo",
  DESIGNATION: "designation",
  OFFICIAL: "mobileOfficial",
  "MOBILE OFFICIAL": "mobileOfficial",
  "OFFICIAL MOBILE": "mobileOfficial",
  PERSONAL: "mobilePersonal",
  "MOBILE PERSONAL": "mobilePersonal",
  "PERSONAL MOBILE": "mobilePersonal",
  LOCATION: "location",
  "BASE LOCATION": "location",
  "INFO GET ON": "date",
  "TRAINING DATE": "date",
  DATE: "date",
  "TRAINING TIME": "time",
  TIME: "time",
  "TRAINING STATUS": "apps",
  APP: "apps",
  APPS: "apps",
  "MODE OF TRAINING": "mode",
  "TRAINING MODE": "mode",
  MODE: "mode",
};

type Cell = string | number | Date | null;

/** Text of a cell, with "-" and blanks treated as empty. */
function str(value: Cell): string | null {
  if (value === null) return null;
  const text = (value instanceof Date ? value.toISOString() : String(value)).trim().replace(/\s+/g, " ");
  return text && !/^[-–—]+$/.test(text) ? text : null;
}

const pad = (n: number) => String(n).padStart(2, "0");

function validDay(y: number, m: number, d: number) {
  const check = new Date(Date.UTC(y, m - 1, d));
  return y >= 2000 && y <= 2100 && check.getUTCMonth() === m - 1 && check.getUTCDate() === d;
}

/**
 * The training day as "YYYY-MM-DD". The sheet mixes Excel dates and hand-typed text
 * ("12-05-26 -", "17-08--2026 02:19", "01/072026 04:06", "5/15/2026"); typed text is day-first.
 */
export function parseLegacyDate(value: Cell): { date: string | null; guessed: boolean } {
  if (value instanceof Date) {
    // Excel date cells arrive with the shown date/time in UTC fields; any time part is ignored.
    const [y, m, d] = [value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate()];
    return validDay(y, m, d) ? { date: `${y}-${pad(m)}-${pad(d)}`, guessed: false } : { date: null, guessed: false };
  }
  if (typeof value === "number") return parseLegacyDate(new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000));

  const text = str(value);
  if (!text) return { date: null, guessed: false };
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(text);
  if (match && validDay(+match[1], +match[2], +match[3])) return { date: `${match[1]}-${pad(+match[2])}-${pad(+match[3])}`, guessed: false };

  match = /^(\d{1,2})\D*?(\d{1,2})\D*(\d{4}|\d{2})(?!\d)/.exec(text);
  if (!match) return { date: null, guessed: false };
  let [d, m] = [+match[1], +match[2]];
  const y = match[3].length === 2 ? 2000 + +match[3] : +match[3];
  let guessed = !/^\d{1,2}[./-]+\d{1,2}[./-]+(\d{2}|\d{4})\b/.test(text); // unusual layout, e.g. "01/072026"
  if (m > 12 && d <= 12) {
    [d, m] = [m, d]; // month-first, e.g. "5/15/2026"
    guessed = true;
  }
  return validDay(y, m, d) ? { date: `${y}-${pad(m)}-${pad(d)}`, guessed } : { date: null, guessed: false };
}

/**
 * Start and end time ("HH:MM", 24h) from text like "02:48 - 03:29", "3.30-4.45", "04 : 00 - 05:50" or "04:30 - 0445".
 * Times were written without AM/PM: hours 1–7 are taken as afternoon (office hours).
 */
export function parseLegacyTime(value: Cell): { start: string | null; end: string | null } {
  // A time-only Excel cell arrives as a Date; its time is in the UTC fields.
  const text = value instanceof Date ? `${value.getUTCHours()}:${pad(value.getUTCMinutes())}` : str(typeof value === "number" ? null : value);
  if (!text) return { start: null, end: null };

  const parts = text
    .toLowerCase()
    .replace(/\s*([:.])\s*/g, "$1")
    .split(/\s*(?:-|–|—|\bto\b)\s*/)
    .filter(Boolean);
  const toMinutes = (part: string): number | null => {
    const m = /^(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm)?$/.exec(part) ?? /^(\d{2})(\d{2})\s*(am|pm)?$/.exec(part);
    if (!m) return null;
    let h = +m[1];
    const min = m[2] ? +m[2] : 0;
    if (h > 23 || min > 59) return null;
    if (m[3] === "pm" && h < 12) h += 12;
    else if (m[3] === "am" && h === 12) h = 0;
    else if (!m[3] && h >= 1 && h <= 7) h += 12;
    return h * 60 + min;
  };
  const fmt = (mins: number) => `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`;

  const start = parts[0] ? toMinutes(parts[0]) : null;
  let end = parts[1] ? toMinutes(parts[1]) : null;
  if (start === null) return { start: null, end: null };
  if (end !== null && end < start && end + 720 < 1440) end += 720; // "11:30 - 12:10" stays, "12:45 - 1:45" becomes 13:45
  return { start: fmt(start), end: end !== null && end >= start ? fmt(end) : null };
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Apps named in a cell, e.g. "HRMS , CRM". Longer names are matched (and removed) first,
// so "Prod CRM" doesn't also count as "CRM".
function parseApps(value: string | null): App[] {
  let text = (value ?? "").toUpperCase();
  const found = new Set<App>();
  for (const app of [...APPS].sort((a, b) => b.length - a.length)) {
    const re = new RegExp(`\\b${escapeRegExp(app.toUpperCase()).replace(/ /g, "\\s+")}\\b`, "g");
    if (re.test(text)) {
      found.add(app);
      text = text.replace(re, " ");
    }
  }
  return APPS.filter((app) => found.has(app));
}

function parseMode(value: string | null): TrainingMode {
  return /online|virtual|teams|meet|zoom/i.test(value ?? "") ? "Online" : "F2F";
}

/** Reads the sheet and normalizes every row; nothing is saved. */
export async function readLegacyTrainingSheet(buffer: Buffer): Promise<LegacyTrainingRow[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

  for (const sheet of workbook.worksheets) {
    for (let headerRow = 1; headerRow <= Math.min(15, sheet.rowCount); headerRow++) {
      const columns = new Map<Column, number>();
      sheet.getRow(headerRow).eachCell((cell, col) => {
        const key = HEADERS[normalize(String(cellValue(cell.value) ?? ""))];
        if (key && !columns.has(key)) columns.set(key, col);
      });
      if (!columns.has("name") || !columns.has("apps")) continue;

      const today = new Date().toISOString().slice(0, 10);
      const rows: LegacyTrainingRow[] = [];
      for (let r = headerRow + 1; r <= sheet.rowCount; r++) {
        const row = sheet.getRow(r);
        const get = (key: Column): Cell => (columns.has(key) ? cellValue(row.getCell(columns.get(key)!).value) : null);
        const name = str(get("name"));
        if (!name) continue;

        const { date, guessed } = parseLegacyDate(get("date"));
        const { start, end } = parseLegacyTime(get("time"));
        const warnings: string[] = [];
        const rawDate = str(get("date"));
        if (rawDate && !date) warnings.push(`Date "${rawDate}" could not be read.`);
        if (guessed) warnings.push(`Date read from "${rawDate}" — please check it.`);
        if (date && date > today) warnings.push("Date is in the future — please check it.");
        const rawTime = str(get("time"));
        if (rawTime && !start) warnings.push(`Time "${rawTime}" could not be read.`);
        const phone = (key: Column) => {
          const v = get(key);
          return typeof v === "number" ? String(v) : str(v);
        };

        rows.push({
          row: r,
          name,
          email: str(get("email"))?.replace(/^mailto:/i, "").toLowerCase() ?? null,
          reportingTo: str(get("reportingTo")),
          designation: str(get("designation")),
          mobileOfficial: phone("mobileOfficial"),
          mobilePersonal: phone("mobilePersonal"),
          location: str(get("location")),
          date,
          start,
          end,
          mode: parseMode(str(get("mode"))),
          apps: parseApps(str(get("apps"))),
          employee: null,
          warnings,
        });
      }
      await matchEmployees(rows);
      return rows;
    }
  }
  throw new Error('No sheet with "User name" and "traning status" column headers was found.');
}

/** Fills in `employee` for rows that match an existing New Joiner (see findEmployee). */
async function matchEmployees(rows: LegacyTrainingRow[]) {
  const { pool } = await getDb();
  const all = (await pool.request().query("SELECT Id, DisplayName, Email FROM dbo.Employees")).recordset as { Id: number; DisplayName: string; Email: string | null }[];
  for (const row of rows) {
    const byEmail = row.email ? all.find((e) => e.Email?.toLowerCase() === row.email) : undefined;
    const byName = all.filter((e) => !e.Email && e.DisplayName.toLowerCase() === row.name?.toLowerCase());
    const match = byEmail ?? (byName.length === 1 ? byName[0] : undefined);
    row.employee = match ? { id: match.Id, name: match.DisplayName } : null;
  }
}

/* ---------------- Saving ---------------- */

interface SaveRow {
  row: number;
  employee: ReturnType<typeof parseEmployee>;
  startAt: Date | null; // null: the sheet has no date
  endAt: Date | null;
  timeRecorded: boolean; // false: only the date is known (startAt is midnight)
  mode: TrainingMode;
  apps: App[]; // empty: the app is unknown, so only the employee is saved
}

function parseSaveRow(item: unknown, i: number): SaveRow {
  const r = (item ?? {}) as Record<string, unknown>;
  const row = Number.isInteger(r.row) ? (r.row as number) : i + 1;
  const employee = parseEmployee({
    DisplayName: r.name,
    Email: r.email,
    ReportingTo: r.reportingTo,
    Designation: r.designation,
    MobileOfficial: r.mobileOfficial,
    MobilePersonal: r.mobilePersonal,
    BaseLocation: r.location,
  });
  const startAt = r.startAt ? new Date(String(r.startAt)) : null;
  if (startAt && Number.isNaN(startAt.getTime())) throw new ValidationError("The training date is not valid.");
  const endAt = startAt && r.endAt ? new Date(String(r.endAt)) : null;
  if (endAt && (Number.isNaN(endAt.getTime()) || endAt < startAt!)) throw new ValidationError("End time must be after the start time.");
  const mode = r.mode as TrainingMode;
  if (!TRAINING_MODES.includes(mode)) throw new ValidationError(`Mode must be one of: ${TRAINING_MODES.join(", ")}.`);
  const apps = APPS.filter((a) => Array.isArray(r.apps) && r.apps.includes(a));
  return { row, employee, startAt, endAt, timeRecorded: Boolean(startAt) && r.timeRecorded !== false, mode, apps };
}

/**
 * Saves reviewed rows as completed training sessions. Rows with the same date, time and mode become one session,
 * trained by `trainerNames` on every app. Employees are matched by email (or by name when they have no email);
 * unknown ones are added to New Joiners, existing ones are left unchanged. Records already saved (same employee,
 * app and start time) are skipped, so importing the same sheet again is safe. Invalid rows are skipped and reported.
 * Missing data is kept missing: no date -> a session with an empty date; no time -> the date at midnight with a note;
 * no app -> only the employee is saved.
 */
export async function importLegacyTraining(items: unknown[], trainerNames: unknown, { dryRun = false } = {}): Promise<LegacyTrainingImportResult> {
  // Trainers must come from the master config; they are saved with its spelling.
  const names = (Array.isArray(trainerNames) ? trainerNames : []).map((t) => String(t ?? "").trim()).filter(Boolean);
  const unknown = names.find((t) => !findTrainer(t));
  if (unknown) throw new ValidationError(`"${unknown}" is not a trainer. Choose one of: ${TRAINERS.join(", ")}.`);
  const trainers = [...new Set(names.map((t) => findTrainer(t)!))];
  if (trainers.length === 0) throw new ValidationError("Choose the trainer.");
  if (trainers.length > MAX_TRAINERS) throw new ValidationError(`At most ${MAX_TRAINERS} trainers can be given.`);

  const result: LegacyTrainingImportResult = { sessions: 0, records: 0, employeesCreated: 0, employeesOnly: 0, duplicates: 0, errors: [] };
  const rows: SaveRow[] = [];
  items.forEach((item, i) => {
    try {
      rows.push(parseSaveRow(item, i));
    } catch (err) {
      if (!(err instanceof ValidationError)) throw err;
      result.errors.push({ row: Number((item as { row?: unknown })?.row) || i + 1, message: err.message });
    }
  });
  if (rows.length === 0) return result;

  // One session per date/time/mode. Rows without an app only save the employee.
  const groups = new Map<string, SaveRow[]>();
  const employeeOnly: SaveRow[] = [];
  for (const r of rows) {
    if (r.apps.length === 0) {
      employeeOnly.push(r);
      continue;
    }
    const key = `${r.startAt?.toISOString() ?? "no-date"}|${r.endAt?.toISOString() ?? ""}|${r.timeRecorded}|${r.mode}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }

  const { sql, pool } = await getDb();
  const tx = new sql.Transaction(pool);
  await tx.begin();
  try {
    const employeeIds = new Map<string, number>(); // email or "name:" + name -> Id, for rows of this import

    const resolveEmployee = async (f: SaveRow["employee"]) => {
      const key = f.Email ?? `name:${f.DisplayName!.toLowerCase()}`;
      const known = employeeIds.get(key);
      if (known) return known;
      const found = await new sql.Request(tx)
        .input("Email", sql.NVarChar(200), f.Email)
        .input("DisplayName", sql.NVarChar(100), f.DisplayName)
        .query(`
          SELECT Id FROM dbo.Employees WITH (UPDLOCK) WHERE @Email IS NOT NULL AND Email = @Email;
          SELECT Id FROM dbo.Employees WITH (UPDLOCK) WHERE Email IS NULL AND DisplayName = @DisplayName;
        `);
      const [byEmail, byName] = found.recordsets as unknown as { Id: number }[][];
      let id = byEmail[0]?.Id ?? (byName.length === 1 ? byName[0].Id : undefined);
      if (!id) {
        id = (await addEmployeeInputs(sql, new sql.Request(tx), f).query(INSERT_EMPLOYEE_SQL)).recordset[0].Id as number;
        result.employeesCreated++;
      }
      employeeIds.set(key, id);
      return id;
    };

    for (const r of employeeOnly) {
      await resolveEmployee(r.employee);
      result.employeesOnly++;
    }

    for (const group of groups.values()) {
      const { startAt, endAt, timeRecorded, mode } = group[0];
      const apps = APPS.filter((a) => group.some((r) => r.apps.includes(a)));
      const notes = ["Imported from the old training sheet."];
      if (!startAt) notes.push("The training date was not recorded.");
      else if (!timeRecorded) notes.push("The training time was not recorded.");
      let sessionId: number | null = null; // created on its first new record

      for (const r of group) {
        const employeeId = await resolveEmployee(r.employee);
        for (const app of r.apps) {
          const exists = await new sql.Request(tx)
            .input("EmployeeId", sql.Int, employeeId)
            .input("App", sql.NVarChar(20), app)
            .input("StartAt", sql.DateTime2, startAt)
            .query(`
              SELECT TOP 1 1 AS Found FROM dbo.TrainingAttendees a JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
              WHERE a.EmployeeId = @EmployeeId AND a.App = @App
                AND (s.StartAt = @StartAt OR (s.StartAt IS NULL AND @StartAt IS NULL))
            `);
          if (exists.recordset.length) {
            result.duplicates++;
            continue;
          }

          if (sessionId === null) {
            sessionId = (
              await new sql.Request(tx)
                .input("Title", sql.NVarChar(200), `${apps.join(" & ")} Training${startAt ? "" : " (date not recorded)"}`)
                .input("StartAt", sql.DateTime2, startAt)
                .input("EndAt", sql.DateTime2, endAt)
                .input("Mode", sql.NVarChar(20), mode)
                .input("Notes", sql.NVarChar(sql.MAX), notes.join(" "))
                .query(`
                  INSERT INTO dbo.TrainingSessions (Title, StartAt, EndAt, Mode, Status, Notes)
                  OUTPUT INSERTED.Id
                  VALUES (@Title, @StartAt, @EndAt, @Mode, N'Completed', @Notes)
                `)
            ).recordset[0].Id as number;
            result.sessions++;
            for (const a of apps) {
              for (const t of trainers) {
                await new sql.Request(tx)
                  .input("SessionId", sql.Int, sessionId)
                  .input("App", sql.NVarChar(20), a)
                  .input("TrainerName", sql.NVarChar(100), t)
                  .query("INSERT INTO dbo.TrainingSessionTrainers (SessionId, App, TrainerName) VALUES (@SessionId, @App, @TrainerName)");
              }
            }
          }

          const req = new sql.Request(tx).input("SessionId", sql.Int, sessionId).input("EmployeeId", sql.Int, employeeId).input("App", sql.NVarChar(20), app);
          const values = trainers.map((t, i) => {
            req.input(`T${i}`, sql.NVarChar(100), t);
            return `(@AttendeeId, @T${i})`;
          });
          await req.query(`
            DECLARE @AttendeeId INT;
            INSERT INTO dbo.TrainingAttendees (SessionId, EmployeeId, App) VALUES (@SessionId, @EmployeeId, @App);
            SET @AttendeeId = SCOPE_IDENTITY();
            INSERT INTO dbo.TrainingAttendeeTrainers (AttendeeId, TrainerName) VALUES ${values.join(", ")};
            -- Being trained on an app means the joiner needs it.
            IF NOT EXISTS (SELECT 1 FROM dbo.EmployeeTrainingApps WHERE EmployeeId = @EmployeeId AND App = @App)
              INSERT INTO dbo.EmployeeTrainingApps (EmployeeId, App) VALUES (@EmployeeId, @App);
          `);
          result.records++;
        }
      }
    }
    // With dryRun, everything is checked and counted, then undone.
    if (dryRun) await tx.rollback();
    else await tx.commit();
  } catch (err) {
    await tx.rollback().catch(() => {});
    throw err;
  }
  return result;
}
