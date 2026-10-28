import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, handleError, parseId } from "@/lib/api";
import { addSessionInputs, insertTrainingImageRows, parseSessionFields, writeSessionPeople } from "@/lib/training";
import { deleteImageFiles, saveImages, validateImages, type SavedImage } from "@/lib/uploads";
import type { TrainingAttendee } from "@/lib/types";

const NOT_FOUND = "Training session not found.";
const INVALID_ID = "Invalid training session ID.";

// GET /api/training/[id]
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/training/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  try {
    const { sql, pool } = await getDb();
    const result = await pool.request().input("Id", sql.Int, id).query(`
      SELECT Id, Title, StartAt, EndAt, Mode, Location, MeetingLink, Status, Notes, CreatedAt, UpdatedAt
      FROM dbo.TrainingSessions WHERE Id = @Id;

      SELECT TrainerName FROM dbo.TrainingSessionTrainers WHERE SessionId = @Id ORDER BY TrainerName;

      SELECT a.AttendeeId, a.EmployeeName, a.EmployeeCode, a.Department, a.App, t.TrainerName
      FROM dbo.TrainingAttendees a
      LEFT JOIN dbo.TrainingAttendeeTrainers t ON t.AttendeeId = a.AttendeeId
      WHERE a.SessionId = @Id
      ORDER BY a.AttendeeId, t.TrainerName;

      SELECT ImageId, OriginalFileName, UploadedAt
      FROM dbo.TrainingImages WHERE SessionId = @Id ORDER BY ImageId;
    `);
    const [sessions, trainers, attendeeRows, images] = result.recordsets as Record<string, unknown>[][];
    const session = sessions[0];
    if (!session) return errorResponse(NOT_FOUND, 404);

    // One row per attendee/trainer pair -> one attendee with a list of trainers, in entry order.
    const attendees = new Map<number, TrainingAttendee>();
    for (const row of attendeeRows) {
      const key = row.AttendeeId as number;
      let attendee = attendees.get(key);
      if (!attendee) {
        attendee = {
          EmployeeName: row.EmployeeName as string,
          EmployeeCode: row.EmployeeCode as string | null,
          Department: row.Department as string | null,
          App: row.App as TrainingAttendee["App"],
          Trainers: [],
        };
        attendees.set(key, attendee);
      }
      if (row.TrainerName) attendee.Trainers.push(row.TrainerName as string);
    }

    return NextResponse.json({
      ...session,
      trainers: trainers.map((r) => r.TrainerName as string),
      attendees: [...attendees.values()],
      images,
    });
  } catch (err) {
    return handleError(err, "load training session");
  }
}

// PUT /api/training/[id]  (multipart/form-data: all session fields, new "images" files, "removeImageIds" values)
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/training/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  let saved: SavedImage[] = [];
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("Request must be multipart/form-data.", 400);
    }

    const fields = parseSessionFields(form);
    const removeIds = [...new Set(form.getAll("removeImageIds").map((v) => parseId(String(v))))];
    if (removeIds.some((v) => v === null)) return errorResponse("Invalid image ID in removeImageIds.", 400);
    const images = await validateImages(form.getAll("images"));

    const { sql, pool } = await getDb();
    saved = await saveImages(images);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    let removedPaths: string[] = [];
    try {
      const updated = await addSessionInputs(sql, new sql.Request(tx).input("Id", sql.Int, id), fields).query(`
        UPDATE dbo.TrainingSessions
        SET Title = @Title, StartAt = @StartAt, EndAt = @EndAt, Mode = @Mode, Location = @Location, MeetingLink = @MeetingLink,
            Status = @Status, Notes = @Notes,
            UpdatedAt = SYSUTCDATETIME()
        WHERE Id = @Id
      `);
      if (updated.rowsAffected[0] === 0) {
        await tx.rollback();
        await deleteImageFiles(saved.map((s) => s.relativePath));
        return errorResponse(NOT_FOUND, 404);
      }

      await writeSessionPeople(sql, tx, id, fields);

      if (removeIds.length > 0) {
        const del = new sql.Request(tx).input("SessionId", sql.Int, id);
        const placeholders = removeIds.map((imageId, i) => {
          del.input(`Img${i}`, sql.Int, imageId);
          return `@Img${i}`;
        });
        // Only images that belong to this session can be removed.
        const deleted = await del.query(`
          DELETE FROM dbo.TrainingImages
          OUTPUT DELETED.ImagePath
          WHERE SessionId = @SessionId AND ImageId IN (${placeholders.join(", ")})
        `);
        removedPaths = deleted.recordset.map((r) => r.ImagePath as string);
      }

      await insertTrainingImageRows(sql, tx, id, saved);
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }

    // Files are deleted only after the database change is committed.
    await deleteImageFiles(removedPaths);
    return NextResponse.json({ id });
  } catch (err) {
    await deleteImageFiles(saved.map((s) => s.relativePath));
    return handleError(err, "update training session");
  }
}

// DELETE /api/training/[id]  (trainers, attendees and image rows are removed by ON DELETE CASCADE)
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/training/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  try {
    const { sql, pool } = await getDb();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    let paths: string[];
    try {
      const images = await new sql.Request(tx)
        .input("Id", sql.Int, id)
        .query("DELETE FROM dbo.TrainingImages OUTPUT DELETED.ImagePath WHERE SessionId = @Id");
      paths = images.recordset.map((r) => r.ImagePath as string);

      const session = await new sql.Request(tx).input("Id", sql.Int, id).query("DELETE FROM dbo.TrainingSessions WHERE Id = @Id");
      if (session.rowsAffected[0] === 0) {
        await tx.rollback();
        return errorResponse(NOT_FOUND, 404);
      }
      await tx.commit();
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }

    await deleteImageFiles(paths);
    return NextResponse.json({ id });
  } catch (err) {
    return handleError(err, "delete training session");
  }
}
