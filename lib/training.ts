import "server-only";
import type * as MSSQL from "mssql";
import { likePattern, text, ValidationError } from "./api";
import {
  APPS,
  MAX_ATTENDEES,
  MAX_TRAINERS,
  TRAINING_MODES,
  TRAINING_STATUSES,
  isMeetingLink,
  type App,
  type TrainingMode,
  type TrainingStatus,
} from "./types";
import type { SavedImage } from "./uploads";

type Sql = typeof MSSQL;

export interface AttendeeFields {
  employeeName: string;
  employeeCode: string | null;
  department: string | null;
  app: App;
  trainers: string[];
}

export interface SessionFields {
  title: string;
  startAt: Date;
  endAt: Date | null;
  mode: TrainingMode;
  location: string | null;
  meetingLink: string | null;
  status: TrainingStatus;
  notes: string | null;
  trainers: string[];
  attendees: AttendeeFields[];
}

// Collapse inner whitespace so "Ravi  Kumar" and "Ravi Kumar" are the same person.
const clean = (value: unknown) => (typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "");

function parseDate(raw: string | null | undefined, label: string): Date | null {
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) throw new ValidationError(`${label} is not a valid date and time.`);
  return date;
}

function parseJsonList(form: FormData, name: string, label: string): unknown[] {
  const raw = form.get(name);
  if (raw === null || raw === "") return [];
  if (typeof raw !== "string") throw new ValidationError(`${label} must be text.`);
  try {
    const value = JSON.parse(raw);
    if (Array.isArray(value)) return value;
  } catch {
    /* fall through */
  }
  throw new ValidationError(`${label} could not be read.`);
}

function parseTrainers(form: FormData): string[] {
  const seen = new Map<string, string>();
  for (const item of parseJsonList(form, "trainers", "Trainers")) {
    const name = clean(item);
    if (!name) continue;
    if (name.length > 100) throw new ValidationError("Trainer names must be 100 characters or fewer.");
    if (!seen.has(name.toLowerCase())) seen.set(name.toLowerCase(), name);
  }
  if (seen.size === 0) throw new ValidationError("Add at least one trainer.");
  if (seen.size > MAX_TRAINERS) throw new ValidationError(`A session can have at most ${MAX_TRAINERS} trainers.`);
  return [...seen.values()];
}

function parseAttendees(form: FormData, trainers: string[]): AttendeeFields[] {
  // Map lower-case names back to the session's spelling of each trainer.
  const trainerLookup = new Map(trainers.map((t) => [t.toLowerCase(), t]));
  const items = parseJsonList(form, "attendees", "Attendees");
  if (items.length > MAX_ATTENDEES) throw new ValidationError(`A session can have at most ${MAX_ATTENDEES} attendee rows.`);

  const seen = new Set<string>();
  return items.map((item, i) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const employeeName = clean(row.employeeName);
    const label = employeeName ? `"${employeeName}"` : `Attendee row ${i + 1}`;
    const employeeCode = clean(row.employeeCode) || null;
    const department = clean(row.department) || null;
    const app = clean(row.app) as App;

    if (!employeeName) throw new ValidationError(`${label}: employee name is required.`);
    if (employeeName.length > 100) throw new ValidationError(`${label}: employee name must be 100 characters or fewer.`);
    if (employeeCode && employeeCode.length > 50) throw new ValidationError(`${label}: employee code must be 50 characters or fewer.`);
    if (department && department.length > 100) throw new ValidationError(`${label}: department must be 100 characters or fewer.`);
    if (!APPS.includes(app)) throw new ValidationError(`${label}: app must be one of ${APPS.join(", ")}.`);

    const key = `${employeeName}|${employeeCode ?? ""}|${app}`.toLowerCase();
    if (seen.has(key)) throw new ValidationError(`${label} is listed twice for ${app}.`);
    seen.add(key);

    const rowTrainers = new Set<string>();
    for (const t of Array.isArray(row.trainers) ? row.trainers : []) {
      const match = trainerLookup.get(clean(t).toLowerCase());
      if (!match) throw new ValidationError(`${label}: "${clean(t)}" is not one of this session's trainers.`);
      rowTrainers.add(match);
    }
    if (rowTrainers.size === 0) throw new ValidationError(`${label}: choose who trained this employee on ${app}.`);

    return { employeeName, employeeCode, department, app, trainers: [...rowTrainers] };
  });
}

/** Validates the whole session form (all fields are always sent, both when creating and editing). */
export function parseSessionFields(form: FormData): SessionFields {
  const title = text(form, "title", 200, "Title");
  const startAt = parseDate(text(form, "startAt", 40, "Start"), "Start");
  const endAt = parseDate(text(form, "endAt", 40, "End"), "End");
  const status = (text(form, "status", 20, "Status") ?? "Scheduled") as TrainingStatus;

  if (!title) throw new ValidationError("Title is required.");
  if (!startAt) throw new ValidationError("Start date and time is required.");
  if (endAt && endAt < startAt) throw new ValidationError("End must be after the start.");
  if (!TRAINING_STATUSES.includes(status)) throw new ValidationError(`Status must be one of: ${TRAINING_STATUSES.join(", ")}.`);

  const mode = (text(form, "mode", 20, "Training mode") ?? "F2F") as TrainingMode;
  if (!TRAINING_MODES.includes(mode)) throw new ValidationError(`Training mode must be one of: ${TRAINING_MODES.join(", ")}.`);
  const location = text(form, "location", 200, "Location") ?? null;
  const meetingLink = text(form, "meetingLink", 500, "Meeting link") ?? null;
  if (mode === "Online") {
    if (!meetingLink) throw new ValidationError("Meeting link is required for online training.");
    if (!isMeetingLink(meetingLink)) throw new ValidationError("Meeting link must be a full web address starting with https://.");
  }

  const trainers = parseTrainers(form);
  return {
    title,
    startAt,
    endAt,
    mode,
    // Keep only the field that applies to the chosen mode.
    location: mode === "F2F" ? location : null,
    meetingLink: mode === "Online" ? meetingLink : null,
    status,
    notes: text(form, "notes", 20000, "Notes") ?? null,
    trainers,
    attendees: parseAttendees(form, trainers),
  };
}

/** Adds the session's own columns as parameters. */
export function addSessionInputs(sql: Sql, request: MSSQL.Request, f: SessionFields) {
  return request
    .input("Title", sql.NVarChar(200), f.title)
    .input("StartAt", sql.DateTime2, f.startAt)
    .input("EndAt", sql.DateTime2, f.endAt)
    .input("Mode", sql.NVarChar(20), f.mode)
    .input("Location", sql.NVarChar(200), f.location)
    .input("MeetingLink", sql.NVarChar(500), f.meetingLink)
    .input("Status", sql.NVarChar(20), f.status)
    .input("Notes", sql.NVarChar(sql.MAX), f.notes);
}

/** Replaces a session's trainers and attendees inside a transaction. */
export async function writeSessionPeople(sql: Sql, tx: MSSQL.Transaction, sessionId: number, f: SessionFields) {
  // Attendee trainer rows are removed by the ON DELETE CASCADE.
  await new sql.Request(tx).input("SessionId", sql.Int, sessionId).query(`
    DELETE FROM dbo.TrainingAttendees WHERE SessionId = @SessionId;
    DELETE FROM dbo.TrainingSessionTrainers WHERE SessionId = @SessionId;
  `);

  for (const trainer of f.trainers) {
    await new sql.Request(tx)
      .input("SessionId", sql.Int, sessionId)
      .input("TrainerName", sql.NVarChar(100), trainer)
      .query("INSERT INTO dbo.TrainingSessionTrainers (SessionId, TrainerName) VALUES (@SessionId, @TrainerName)");
  }

  for (const a of f.attendees) {
    const req = new sql.Request(tx)
      .input("SessionId", sql.Int, sessionId)
      .input("EmployeeName", sql.NVarChar(100), a.employeeName)
      .input("EmployeeCode", sql.NVarChar(50), a.employeeCode)
      .input("Department", sql.NVarChar(100), a.department)
      .input("App", sql.NVarChar(20), a.app);
    const values = a.trainers.map((t, i) => {
      req.input(`T${i}`, sql.NVarChar(100), t);
      return `(@AttendeeId, @T${i})`;
    });
    await req.query(`
      DECLARE @AttendeeId INT;
      INSERT INTO dbo.TrainingAttendees (SessionId, EmployeeName, EmployeeCode, Department, App)
      VALUES (@SessionId, @EmployeeName, @EmployeeCode, @Department, @App);
      SET @AttendeeId = SCOPE_IDENTITY();
      INSERT INTO dbo.TrainingAttendeeTrainers (AttendeeId, TrainerName) VALUES ${values.join(", ")};
    `);
  }
}

/** Inserts TrainingImages rows for files that were already written to disk. */
export async function insertTrainingImageRows(sql: Sql, tx: MSSQL.Transaction, sessionId: number, saved: SavedImage[]) {
  for (const img of saved) {
    await new sql.Request(tx)
      .input("SessionId", sql.Int, sessionId)
      .input("ImagePath", sql.NVarChar(500), img.relativePath)
      .input("OriginalFileName", sql.NVarChar(255), img.originalName)
      .query("INSERT INTO dbo.TrainingImages (SessionId, ImagePath, OriginalFileName) VALUES (@SessionId, @ImagePath, @OriginalFileName)");
  }
}

/**
 * Builds the WHERE/ORDER BY for training lists from URL filters
 * (search, app, status, trainer, from, to, sort), adding parameters to `req`.
 * Sessions are aliased as `s`; at the "attendee" level attendees are aliased as `a` too.
 */
export function buildTrainingFilter(sql: Sql, req: MSSQL.Request, params: URLSearchParams, level: "session" | "attendee") {
  const where: string[] = [];
  const attendeeWhere: string[] = []; // conditions on a single attendee row

  const search = params.get("search")?.trim().slice(0, 200);
  if (search) {
    req.input("Search", sql.NVarChar(210), likePattern(search));
    const attendeeMatch = `(a.EmployeeName LIKE @Search OR a.EmployeeCode LIKE @Search OR a.Department LIKE @Search
      OR EXISTS (SELECT 1 FROM dbo.TrainingAttendeeTrainers st WHERE st.AttendeeId = a.AttendeeId AND st.TrainerName LIKE @Search))`;
    const sessionMatch = ["s.Title LIKE @Search", "s.Location LIKE @Search"];
    const idMatch = search.replace(/^#/, "");
    if (/^\d{1,9}$/.test(idMatch)) {
      req.input("SearchId", sql.Int, Number(idMatch));
      sessionMatch.push("s.Id = @SearchId");
    }
    if (level === "session") {
      sessionMatch.push("EXISTS (SELECT 1 FROM dbo.TrainingSessionTrainers sst WHERE sst.SessionId = s.Id AND sst.TrainerName LIKE @Search)");
      sessionMatch.push(`EXISTS (SELECT 1 FROM dbo.TrainingAttendees a WHERE a.SessionId = s.Id AND ${attendeeMatch})`);
    } else {
      sessionMatch.push(attendeeMatch);
    }
    where.push(`(${sessionMatch.join(" OR ")})`);
  }

  const app = params.get("app");
  if (app && (APPS as readonly string[]).includes(app)) {
    req.input("App", sql.NVarChar(20), app);
    attendeeWhere.push("a.App = @App");
  }

  const trainer = params.get("trainer")?.trim();
  if (trainer) {
    req.input("Trainer", sql.NVarChar(100), trainer.slice(0, 100));
    attendeeWhere.push("EXISTS (SELECT 1 FROM dbo.TrainingAttendeeTrainers ft WHERE ft.AttendeeId = a.AttendeeId AND ft.TrainerName = @Trainer)");
  }

  if (attendeeWhere.length) {
    // At session level, one attendee must match every attendee condition.
    if (level === "session") where.push(`EXISTS (SELECT 1 FROM dbo.TrainingAttendees a WHERE a.SessionId = s.Id AND ${attendeeWhere.join(" AND ")})`);
    else where.push(...attendeeWhere);
  }

  const status = params.get("status");
  if (status && (TRAINING_STATUSES as readonly string[]).includes(status)) {
    req.input("Status", sql.NVarChar(20), status);
    where.push("s.Status = @Status");
  }

  // from/to are ISO timestamps (the browser sends the start of the local day).
  const from = new Date(params.get("from") ?? "");
  if (params.get("from") && !Number.isNaN(from.getTime())) {
    req.input("From", sql.DateTime2, from);
    where.push("s.StartAt >= @From");
  }
  const to = new Date(params.get("to") ?? "");
  if (params.get("to") && !Number.isNaN(to.getTime())) {
    req.input("To", sql.DateTime2, to);
    where.push("s.StartAt < @To");
  }

  const order = params.get("sort") === "oldest" ? "ASC" : "DESC";
  return {
    whereSql: where.length ? `WHERE ${where.join(" AND ")}` : "",
    orderSql: level === "session" ? `ORDER BY s.StartAt ${order}, s.Id ${order}` : `ORDER BY s.StartAt ${order}, s.Id ${order}, a.EmployeeName, a.App`,
  };
}

/** Attendee-level rows ("who was trained on what, by whom") used by the records view and the Excel export. */
export function recordsQuery(whereSql: string, orderSql: string) {
  return `
    SELECT a.AttendeeId, s.Id AS SessionId, s.Title, s.StartAt, s.EndAt, s.Mode, s.Location, s.MeetingLink, s.Status,
           a.EmployeeName, a.EmployeeCode, a.Department, a.App,
           (SELECT STRING_AGG(t.TrainerName, N', ') WITHIN GROUP (ORDER BY t.TrainerName)
            FROM dbo.TrainingAttendeeTrainers t WHERE t.AttendeeId = a.AttendeeId) AS Trainers
    FROM dbo.TrainingAttendees a
    JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
    ${whereSql}
    ${orderSql};
  `;
}
