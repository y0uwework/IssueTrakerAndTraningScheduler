import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, handleError, parseId } from "@/lib/api";
import { EMPLOYEE_SELECT, UPDATE_EMPLOYEE_SQL, addEmployeeInputs, isDuplicateKey, parseEmployee } from "@/lib/employees";

const NOT_FOUND = "Employee not found.";
const INVALID_ID = "Invalid employee ID.";

// GET /api/employees/[id]  (employee + training history)
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/employees/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  try {
    const { sql, pool } = await getDb();
    const result = await pool.request().input("Id", sql.Int, id).query(`
      ${EMPLOYEE_SELECT}
      WHERE e.Id = @Id;

      SELECT s.Id AS SessionId, s.Title, s.StartAt, s.Status, a.App,
             (SELECT STRING_AGG(t.TrainerName, N', ') WITHIN GROUP (ORDER BY t.TrainerName)
              FROM dbo.TrainingAttendeeTrainers t WHERE t.AttendeeId = a.AttendeeId) AS Trainers
      FROM dbo.TrainingAttendees a
      JOIN dbo.TrainingSessions s ON s.Id = a.SessionId
      WHERE a.EmployeeId = @Id
      ORDER BY s.StartAt DESC, a.App;
    `);
    const [employees, training] = result.recordsets as Record<string, unknown>[][];
    if (!employees[0]) return errorResponse(NOT_FOUND, 404);
    return NextResponse.json({ ...employees[0], training });
  } catch (err) {
    return handleError(err, "load employee");
  }
}

// PUT /api/employees/[id]  (JSON: all employee columns)
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/employees/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  try {
    const input = await request.json().catch(() => null);
    if (!input || typeof input !== "object") return errorResponse("Request body must be JSON.", 400);
    const fields = parseEmployee(input);

    const { sql, pool } = await getDb();
    const updated = await addEmployeeInputs(sql, pool.request().input("Id", sql.Int, id), fields).query(UPDATE_EMPLOYEE_SQL);
    if (updated.rowsAffected[0] === 0) return errorResponse(NOT_FOUND, 404);
    return NextResponse.json({ id });
  } catch (err) {
    if (isDuplicateKey(err)) return errorResponse("Another employee already has this email address.", 409);
    return handleError(err, "update employee");
  }
}

// DELETE /api/employees/[id]  (refused while the employee appears in training sessions)
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/employees/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  try {
    const { sql, pool } = await getDb();
    const result = await pool.request().input("Id", sql.Int, id).query(`
      DECLARE @Records INT = (SELECT COUNT(*) FROM dbo.TrainingAttendees WHERE EmployeeId = @Id);
      DECLARE @Deleted INT = 0;
      IF @Records = 0
      BEGIN
        DELETE FROM dbo.Employees WHERE Id = @Id;
        SET @Deleted = @@ROWCOUNT;
      END
      SELECT @Records AS Records, @Deleted AS Deleted;
    `);
    const { Records, Deleted } = result.recordset[0] as { Records: number; Deleted: number };
    if (Records > 0) {
      return errorResponse(
        `This employee has ${Records} training record${Records === 1 ? "" : "s"}, so it can't be deleted. Set the status to Inactive instead, or remove them from those sessions first.`,
        409,
      );
    }
    if (!Deleted) return errorResponse(NOT_FOUND, 404);
    return NextResponse.json({ id });
  } catch (err) {
    return handleError(err, "delete employee");
  }
}
