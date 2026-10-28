import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import { getDb } from "@/lib/db";
import { handleError } from "@/lib/api";
import { buildTrainingFilter, recordsQuery } from "@/lib/training";
import { TRAINING_MODE_LABELS, type TrainingMode } from "@/lib/types";

const DATE_FORMAT = "dd-mmm-yyyy hh:mm";

// Excel has no time zones: shift UTC timestamps so the sheet shows this PC's local time.
function localDate(value: Date | null) {
  return value ? new Date(value.getTime() - value.getTimezoneOffset() * 60000) : null;
}

// Readable mode plus the venue (face to face) or meeting link (online) in one column.
function modeColumns(row: Record<string, unknown>) {
  const mode = row.Mode as TrainingMode;
  return { Mode: TRAINING_MODE_LABELS[mode] ?? mode, Where: (mode === "Online" ? row.MeetingLink : row.Location) ?? "" };
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
}

// GET /api/training/export?<same filters as /api/training>  -> .xlsx download
export async function GET(request: NextRequest) {
  try {
    const { sql, pool } = await getDb();
    const params = request.nextUrl.searchParams;

    const recordsReq = pool.request();
    const records = buildTrainingFilter(sql, recordsReq, params, "attendee");
    const sessionsReq = pool.request();
    const sessions = buildTrainingFilter(sql, sessionsReq, params, "session");

    const [recordRows, sessionRows] = await Promise.all([
      recordsReq.query(recordsQuery(records.whereSql, records.orderSql)),
      sessionsReq.query(`
        SELECT s.Id, s.Title, s.StartAt, s.EndAt, s.Mode, s.Location, s.MeetingLink, s.Status, s.Notes,
               (SELECT STRING_AGG(t.TrainerName + N' (' + t.App + N')', N', ') WITHIN GROUP (ORDER BY t.App DESC, t.TrainerName)
                FROM dbo.TrainingSessionTrainers t WHERE t.SessionId = s.Id) AS Trainers,
               (SELECT COUNT(*) FROM dbo.TrainingAttendees a WHERE a.SessionId = s.Id) AS AttendeeCount,
               (SELECT COUNT(*) FROM dbo.TrainingImages im WHERE im.SessionId = s.Id) AS ImageCount
        FROM dbo.TrainingSessions s
        ${sessions.whereSql}
        ${sessions.orderSql};
      `),
    ]);

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();

    const recordSheet = workbook.addWorksheet("Training Records", { views: [{ state: "frozen", ySplit: 1 }] });
    recordSheet.columns = [
      { header: "Employee", key: "DisplayName", width: 24 },
      { header: "Email", key: "Email", width: 28 },
      { header: "Unit", key: "Unit", width: 10 },
      { header: "Level", key: "EmployeeLevel", width: 10 },
      { header: "Designation", key: "Designation", width: 18 },
      { header: "Department", key: "Department", width: 18 },
      { header: "Base Location", key: "BaseLocation", width: 18 },
      { header: "Date of Joining", key: "DateOfJoining", width: 14, style: { numFmt: "dd.mm.yyyy" } },
      { header: "Reporting To", key: "ReportingTo", width: 18 },
      { header: "App", key: "App", width: 8 },
      { header: "Trained By", key: "Trainers", width: 28 },
      { header: "Session ID", key: "SessionId", width: 10 },
      { header: "Session", key: "Title", width: 32 },
      { header: "Start", key: "StartAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "End", key: "EndAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "Mode", key: "Mode", width: 13 },
      { header: "Location / Meeting Link", key: "Where", width: 28 },
      { header: "Status", key: "Status", width: 12 },
    ];
    styleHeader(recordSheet);
    for (const r of recordRows.recordset) {
      recordSheet.addRow({ ...r, ...modeColumns(r), StartAt: localDate(r.StartAt), EndAt: localDate(r.EndAt) }).alignment = { vertical: "top", wrapText: true };
    }

    const sessionSheet = workbook.addWorksheet("Sessions", { views: [{ state: "frozen", ySplit: 1 }] });
    sessionSheet.columns = [
      { header: "ID", key: "Id", width: 7 },
      { header: "Title", key: "Title", width: 32 },
      { header: "Start", key: "StartAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "End", key: "EndAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "Mode", key: "Mode", width: 13 },
      { header: "Location / Meeting Link", key: "Where", width: 28 },
      { header: "Status", key: "Status", width: 12 },
      { header: "Trainers", key: "Trainers", width: 28 },
      { header: "Employee/App Rows", key: "AttendeeCount", width: 16 },
      { header: "Screenshots", key: "ImageCount", width: 12 },
      { header: "Notes", key: "Notes", width: 50 },
    ];
    styleHeader(sessionSheet);
    for (const s of sessionRows.recordset) {
      sessionSheet.addRow({ ...s, ...modeColumns(s), StartAt: localDate(s.StartAt), EndAt: localDate(s.EndAt) }).alignment = { vertical: "top", wrapText: true };
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = localDate(new Date())!.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="training_records_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "export training records");
  }
}
