import "server-only";
import type * as MSSQL from "mssql";
import { likePattern, text, ValidationError } from "./api";
import {
  APPS,
  MAX_ATTENDEES,
  MAX_TRAINERS,
  TRAINING_MODES,
  TRAINING_STATUSES,
  TRAINERS,
  findTrainer,
  isMeetingLink,
  type App,
  type TrainingMode,
  type TrainingStatus,
} from "./types";
import type { SavedImage } from "./uploads";

type Sql = typeof MSSQL;

export interface AttendeeFields {
  employeeId: number;
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
  trainers: Record<App, string[]>;
  attendees: AttendeeFields[];
}

// Collapse inner whitespace so "Anil  Kumar" and "Anil Kumar" are the same trainer.
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

/** "trainers" is a JSON list of { app, name }: trainers are assigned per app. */
function parseTrainers(form: FormData): Record<App, string[]> {
  const byApp = Object.fromEntries(APPS.map((a) => [a, new Map<string, string>()])) as Record<App, Map<string, string>>;
  for (const item of parseJsonList(form, "trainers", "Trainers")) {
    const row = (item ?? {}) as Record<string, unknown>;
    const app = clean(row.app) as App;
    const name = clean(row.name);
    if (!APPS.includes(app)) throw new ValidationError(`Each trainer needs an app (${APPS.join(", ")}).`);
    if (!name) continue;
    // Trainers must come from the master config; they are saved with its spelling.
    const trainer = findTrainer(name);
    if (!trainer) throw new ValidationError(`"${name}" is not a trainer. Choose one of: ${TRAINERS.join(", ")}.`);
    if (!byApp[app].has(trainer.toLowerCase())) byApp[app].set(trainer.toLowerCase(), trainer);
  }
  const trainers = Object.fromEntries(APPS.map((a) => [a, [...byApp[a].values()]])) as Record<App, string[]>;
  const total = APPS.reduce((n, a) => n + trainers[a].length, 0);
  if (total === 0) throw new ValidationError("Assign at least one trainer.");
  if (total > MAX_TRAINERS) throw new ValidationError(`A session can have at most ${MAX_TRAINERS} trainers.`);
  return trainers;
}

/** "attendees" is a JSON list of { employeeId, app, trainers[] }; trainers must be assigned to that app. */
function parseAttendees(form: FormData, trainers: Record<App, string[]>): AttendeeFields[] {
  const items = parseJsonList(form, "attendees", "Employees");
  if (items.length > MAX_ATTENDEES) throw new ValidationError(`A session can have at most ${MAX_ATTENDEES} employee rows.`);

  const seen = new Set<string>();
  return items.map((item, i) => {
    const row = (item ?? {}) as Record<string, unknown>;
    const employeeId = Number(row.employeeId);
    const app = clean(row.app) as App;
    const label = `Employee row ${i + 1}`;

    if (!Number.isInteger(employeeId) || employeeId <= 0) throw new ValidationError(`${label}: no employee selected.`);
    if (!APPS.includes(app)) throw new ValidationError(`${label}: app must be one of ${APPS.join(", ")}.`);
    if (seen.has(`${employeeId}|${app}`)) throw new ValidationError(`${label}: the same employee is listed twice for ${app}.`);
    seen.add(`${employeeId}|${app}`);

    // Map lower-case names back to the session's spelling of each trainer for this app.
    const lookup = new Map(trainers[app].map((t) => [t.toLowerCase(), t]));
    const rowTrainers = new Set<string>();
    for (const t of Array.isArray(row.trainers) ? row.trainers : []) {
      const match = lookup.get(clean(t).toLowerCase());
      if (!match) throw new ValidationError(`${label}: "${clean(t)}" is not a ${app} trainer for this session.`);
      rowTrainers.add(match);
    }
    if (rowTrainers.size === 0) {
      throw new ValidationError(trainers[app].length ? `${label}: choose who trained this employee on ${app}.` : `Assign a ${app} trainer, or remove the ${app} employees.`);
    }
    return { employeeId, app, trainers: [...rowTrainers] };
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

  for (const app of APPS) {
    for (const trainer of f.trainers[app]) {
      await new sql.Request(tx)
        .input("SessionId", sql.Int, sessionId)
        .input("App", sql.NVarChar(20), app)
        .input("TrainerName", sql.NVarChar(100), trainer)
        .query("INSERT INTO dbo.TrainingSessionTrainers (SessionId, App, TrainerName) VALUES (@SessionId, @App, @TrainerName)");
    }
  }

  // Every selected employee must still exist.
  const ids = [...new Set(f.attendees.map((a) => a.employeeId))];
  if (ids.length > 0) {
    const found = await new sql.Request(tx).query(`SELECT Id FROM dbo.Employees WHERE Id IN (${ids.join(", ")})`);
    if (found.recordset.length !== ids.length) throw new ValidationError("One of the selected employees no longer exists. Reload and try again.");
  }

  for (const a of f.attendees) {
    const req = new sql.Request(tx)
      .input("SessionId", sql.Int, sessionId)
      .input("EmployeeId", sql.Int, a.employeeId)
      .input("App", sql.NVarChar(20), a.app);
    const values = a.trainers.map((t, i) => {
      req.input(`T${i}`, sql.NVarChar(100), t);
      return `(@AttendeeId, @T${i})`;
    });
    await req.query(`
      DECLARE @AttendeeId INT;
      INSERT INTO dbo.TrainingAttendees (SessionId, EmployeeId, App)
      VALUES (@SessionId, @EmployeeId, @App);
      SET @AttendeeId = SCOPE_IDENTITY();
      INSERT INTO dbo.TrainingAttendeeTrainers (AttendeeId, TrainerName) VALUES ${values.join(", ")};
      -- Being trained on an app means the joiner needs it.
      IF NOT EXISTS (SELECT 1 FROM dbo.EmployeeTrainingApps WHERE EmployeeId = @EmployeeId AND App = @App)
        INSERT INTO dbo.EmployeeTrainingApps (EmployeeId, App) VALUES (@EmployeeId, @App);
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
 * Sessions are aliased as `s`; at the "attendee" level attendees (`a`) and their employees (`e`) too.
 */
export function buildTrainingFilter(sql: Sql, req: MSSQL.Request, params: URLSearchParams, level: "session" | "attendee") {
  const where: string[] = [];
  const attendeeWhere: string[] = []; // conditions on a single attendee row

  const search = params.get("search")?.trim().slice(0, 200);
  if (search) {
    req.input("Search", sql.NVarChar(210), likePattern(search));
    // `e` is the attendee's employee.
    const attendeeMatch = `(e.DisplayName LIKE @Search OR e.Email LIKE @Search OR e.Department LIKE @Search OR e.Designation LIKE @Search
      OR EXISTS (SELECT 1 FROM dbo.TrainingAttendeeTrainers st WHERE st.AttendeeId = a.AttendeeId AND st.TrainerName LIKE @Search))`;
    const sessionMatch = ["s.Title LIKE @Search", "s.Location LIKE @Search"];
    const idMatch = search.replace(/^#/, "");
    if (/^\d{1,9}$/.test(idMatch)) {
      req.input("SearchId", sql.Int, Number(idMatch));
      sessionMatch.push("s.Id = @SearchId");
    }
    if (level === "session") {
      sessionMatch.push("EXISTS (SELECT 1 FROM dbo.TrainingSessionTrainers sst WHERE sst.SessionId = s.Id AND sst.TrainerName LIKE @Search)");
      sessionMatch.push(`EXISTS (SELECT 1 FROM dbo.TrainingAttendees a JOIN dbo.Employees e ON e.Id = a.EmployeeId WHERE a.SessionId = s.Id AND ${attendeeMatch})`);
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
    orderSql: level === "session" ? `ORDER BY s.StartAt ${order}, s.Id ${order}` : `ORDER BY s.StartAt ${order}, s.Id ${order}, e.DisplayName, a.App`,
  };
}

/** Attendee-level rows ("who was trained on what, by whom") used by the records view and the Excel export. */
export function recordsQuery(whereSql: string, orderSql: string) {
  return `
    SELECT a.AttendeeId, s.Id AS SessionId, s.Title, s.StartAt, s.EndAt, s.Mode, s.Location, s.MeetingLink, s.Status,
           e.Id AS EmployeeId, e.DisplayName, e.Email, e.Unit, e.EmployeeLevel, e.Designation, e.Department, e.BaseLocation,
           e.DateOfJoining, e.ReportingTo, a.App,
           (SELECT STRING_AGG(t.TrainerName, N', ') WITHIN GROUP (ORDER BY t.TrainerName)
            FROM dbo.TrainingAttendeeTrainers t WHERE t.AttendeeId = a.AttendeeId) AS Trainers
    FROM dbo.TrainingAttendees a
    JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
    JOIN dbo.Employees e ON e.Id = a.EmployeeId
    ${whereSql}
    ${orderSql};
  `;
}
