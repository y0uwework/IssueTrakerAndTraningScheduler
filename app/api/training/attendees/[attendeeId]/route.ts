import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, handleError, parseId } from "@/lib/api";
import { MAX_TRAINERS, TRAINERS, findTrainer } from "@/lib/types";

// PATCH /api/training/attendees/[attendeeId]  (JSON: { trainer })
// Sets who trained this employee on this app (one trainer from the master config). If that trainer
// isn't assigned to the session for this app yet, they are added to the session too.
export async function PATCH(request: NextRequest, ctx: RouteContext<"/api/training/attendees/[attendeeId]">) {
  const attendeeId = parseId((await ctx.params).attendeeId);
  if (!attendeeId) return errorResponse("Invalid training record ID.", 400);

  const body = (await request.json().catch(() => null)) as { trainer?: unknown } | null;
  const trainer = typeof body?.trainer === "string" ? findTrainer(body.trainer) : undefined;
  if (!trainer) return errorResponse(`Choose a trainer: ${TRAINERS.join(", ")}.`, 400);

  try {
    const { sql, pool } = await getDb();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const req = () => new sql.Request(tx).input("AttendeeId", sql.Int, attendeeId).input("Trainer", sql.NVarChar(100), trainer);
      const result = await req().query(`
        DECLARE @SessionId INT, @App NVARCHAR(20);
        SELECT @SessionId = SessionId, @App = App FROM dbo.TrainingAttendees WITH (UPDLOCK) WHERE AttendeeId = @AttendeeId;
        IF @SessionId IS NULL
        BEGIN
          SELECT CAST(0 AS BIT) AS found, 0 AS trainerCount;
          RETURN;
        END

        IF NOT EXISTS (SELECT 1 FROM dbo.TrainingSessionTrainers WHERE SessionId = @SessionId AND App = @App AND TrainerName = @Trainer)
          INSERT INTO dbo.TrainingSessionTrainers (SessionId, App, TrainerName) VALUES (@SessionId, @App, @Trainer);

        DELETE FROM dbo.TrainingAttendeeTrainers WHERE AttendeeId = @AttendeeId;
        INSERT INTO dbo.TrainingAttendeeTrainers (AttendeeId, TrainerName) VALUES (@AttendeeId, @Trainer);
        UPDATE dbo.TrainingSessions SET UpdatedAt = SYSUTCDATETIME() WHERE Id = @SessionId;

        SELECT CAST(1 AS BIT) AS found, (SELECT COUNT(*) FROM dbo.TrainingSessionTrainers WHERE SessionId = @SessionId) AS trainerCount;
      `);
      const { found, trainerCount } = result.recordset[0] as { found: boolean; trainerCount: number };
      if (!found) {
        await tx.rollback();
        return errorResponse("Training record not found.", 404);
      }
      if (trainerCount > MAX_TRAINERS) {
        await tx.rollback();
        return errorResponse(`A session can have at most ${MAX_TRAINERS} trainers.`, 400);
      }
      await tx.commit();
      return NextResponse.json({ attendeeId, trainers: trainer });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (err) {
    return handleError(err, "update the trainer");
  }
}
