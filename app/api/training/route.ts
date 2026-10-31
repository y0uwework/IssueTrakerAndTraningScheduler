import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, handleError, paging, readPageInfo } from "@/lib/api";
import {
  addSessionInputs,
  buildPendingFilter,
  buildTrainingFilter,
  insertTrainingImageRows,
  parseSessionFields,
  pendingCountSql,
  pendingQuery,
  recordsQuery,
  writeSessionPeople,
} from "@/lib/training";
import { deleteImageFiles, saveImages, validateImages, type SavedImage } from "@/lib/uploads";
import type { TrainingListResponse } from "@/lib/types";

// GET /api/training?view=sessions|records&search=&app=&status=&trainer=&from=&to=&sort=newest|oldest&page=1
// GET /api/training?view=pending&search=&app=&state=unscheduled|scheduled&sort=newest|oldest&page=1
export async function GET(request: NextRequest) {
  try {
    const { sql, pool } = await getDb();
    const req = pool.request();
    const params = request.nextUrl.searchParams;
    const viewParam = params.get("view");
    const view = viewParam === "records" || viewParam === "pending" ? viewParam : "sessions";
    const { whereSql, orderSql } =
      view === "pending" ? buildPendingFilter(sql, req, params) : buildTrainingFilter(sql, req, params, view === "records" ? "attendee" : "session");
    const countSql =
      view === "pending"
        ? pendingCountSql(whereSql)
        : view === "records"
          ? `SELECT COUNT(*) FROM dbo.TrainingAttendees a
           JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
           JOIN dbo.Employees e ON e.Id = a.EmployeeId
           ${whereSql}`
          : `SELECT COUNT(*) FROM dbo.TrainingSessions s ${whereSql}`;
    const { prelude, pageSql, pageInfoSql } = paging(sql, req, params, countSql);

    const listSql =
      view === "pending"
        ? pendingQuery(whereSql, `${orderSql} ${pageSql}`)
        : view === "records"
        ? recordsQuery(whereSql, `${orderSql} ${pageSql}`)
        : `
      SELECT s.Id, s.Title, s.StartAt, s.EndAt, s.Mode, s.Location, s.MeetingLink, s.Status, s.CreatedAt, s.UpdatedAt,
             (SELECT STRING_AGG(t.TrainerName + N' (' + t.App + N')', N', ') WITHIN GROUP (ORDER BY t.App DESC, t.TrainerName)
              FROM dbo.TrainingSessionTrainers t WHERE t.SessionId = s.Id) AS Trainers,
             (SELECT STRING_AGG(x.App, N', ') WITHIN GROUP (ORDER BY x.App)
              FROM (SELECT DISTINCT a.App FROM dbo.TrainingAttendees a WHERE a.SessionId = s.Id) x) AS Apps,
             (SELECT COUNT(*) FROM dbo.TrainingAttendees a WHERE a.SessionId = s.Id) AS AttendeeCount,
             (SELECT COUNT(DISTINCT a.EmployeeId) FROM dbo.TrainingAttendees a WHERE a.SessionId = s.Id) AS EmployeeCount,
             (SELECT COUNT(*) FROM dbo.TrainingImages im WHERE im.SessionId = s.Id) AS ImageCount
      FROM dbo.TrainingSessions s
      ${whereSql}
      ${orderSql}
      ${pageSql};
    `;

    const result = await req.query(`
      ${prelude}

      ${listSql}

      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN Status = N'Scheduled' AND StartAt >= SYSUTCDATETIME() THEN 1 ELSE 0 END), 0) AS upcoming,
             COALESCE(SUM(CASE WHEN Status = N'Completed' THEN 1 ELSE 0 END), 0) AS completed
      FROM dbo.TrainingSessions;

      SELECT COUNT(DISTINCT a.EmployeeId) AS employeesTrained
      FROM dbo.TrainingAttendees a JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
      WHERE s.Status = N'Completed';

      SELECT (${pendingCountSql()}) AS pendingTraining;

      ${pageInfoSql}
    `);

    const [list, stats, trained, pending, pageInfo] = result.recordsets as Record<string, unknown>[][];
    const body: TrainingListResponse = {
      ...readPageInfo(pageInfo[0]),
      [view]: list,
      stats: { ...stats[0], employeesTrained: trained[0].employeesTrained, pendingTraining: pending[0].pendingTraining } as TrainingListResponse["stats"],
    };
    return NextResponse.json(body);
  } catch (err) {
    return handleError(err, "load training records");
  }
}

// POST /api/training  (multipart/form-data: session fields, "trainers" [{app, name}] + "attendees" [{employeeId, app, trainers}] JSON, "images" files)
export async function POST(request: NextRequest) {
  let saved: SavedImage[] = [];
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("Request must be multipart/form-data.", 400);
    }

    const fields = parseSessionFields(form);
    const images = await validateImages(form.getAll("images"));

    const { sql, pool } = await getDb();
    saved = await saveImages(images);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const inserted = await addSessionInputs(sql, new sql.Request(tx), fields).query(`
        INSERT INTO dbo.TrainingSessions (Title, StartAt, EndAt, Mode, Location, MeetingLink, Status, Notes)
        OUTPUT INSERTED.Id
        VALUES (@Title, @StartAt, @EndAt, @Mode, @Location, @MeetingLink, @Status, @Notes)
      `);
      const id = inserted.recordset[0].Id as number;
      await writeSessionPeople(sql, tx, id, fields);
      await insertTrainingImageRows(sql, tx, id, saved);
      await tx.commit();
      return NextResponse.json({ id }, { status: 201 });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (err) {
    // Nothing was committed, so remove any files written for this request.
    await deleteImageFiles(saved.map((s) => s.relativePath));
    return handleError(err, "create training session");
  }
}
