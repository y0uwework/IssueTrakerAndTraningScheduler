import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addIssueInputs, errorResponse, handleError, insertImageRows, parseId, parseIssueFields, type IssueFields } from "@/lib/api";
import { deleteImageFiles, saveImages, validateImages, type SavedImage } from "@/lib/uploads";

const NOT_FOUND = "Issue not found.";
const INVALID_ID = "Invalid issue ID.";

// GET /api/issues/[id]
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/issues/[id]">) {
  const id = parseId((await ctx.params).id);
  if (!id) return errorResponse(INVALID_ID, 400);

  try {
    const { sql, pool } = await getDb();
    const result = await pool.request().input("Id", sql.Int, id).query(`
      SELECT Id, Title, App, Description, Category, Priority, Status, RaisedBy, AssignedTo, RaisedAt, UpdatedAt, ResolvedAt
      FROM dbo.Issues WHERE Id = @Id;

      SELECT ImageId, OriginalFileName, UploadedAt
      FROM dbo.IssueImages WHERE IssueId = @Id ORDER BY ImageId;
    `);
    const recordsets = result.recordsets as Record<string, unknown>[][];
    const issue = recordsets[0][0];
    if (!issue) return errorResponse(NOT_FOUND, 404);
    return NextResponse.json({ ...issue, images: recordsets[1] });
  } catch (err) {
    return handleError(err, "load issue");
  }
}

// PUT /api/issues/[id]  (multipart/form-data: issue fields, new "images" files, "removeImageIds" values)
export async function PUT(request: NextRequest, ctx: RouteContext<"/api/issues/[id]">) {
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

    const removeIds = [...new Set(form.getAll("removeImageIds").map((v) => parseId(String(v))))];
    if (removeIds.some((v) => v === null)) return errorResponse("Invalid image ID in removeImageIds.", 400);
    const images = await validateImages(form.getAll("images"));

    const { sql, pool } = await getDb();
    saved = await saveImages(images);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    let removedPaths: string[] = [];
    try {
      const current = await new sql.Request(tx).input("Id", sql.Int, id).query(`
        SELECT Title, App, Description, Category, Priority, Status, RaisedBy, AssignedTo
        FROM dbo.Issues WITH (UPDLOCK, ROWLOCK) WHERE Id = @Id
      `);
      const row = current.recordset[0];
      if (!row) {
        await tx.rollback();
        await deleteImageFiles(saved.map((s) => s.relativePath));
        return errorResponse(NOT_FOUND, 404);
      }

      const existing: IssueFields = {
        title: row.Title,
        app: row.App,
        description: row.Description,
        category: row.Category,
        priority: row.Priority,
        status: row.Status,
        raisedBy: row.RaisedBy,
        assignedTo: row.AssignedTo,
      };
      const fields = parseIssueFields(form, existing);

      await addIssueInputs(sql, new sql.Request(tx).input("Id", sql.Int, id), fields).query(`
        UPDATE dbo.Issues
        SET Title = @Title, App = @App, Description = @Description, Category = @Category, Priority = @Priority,
            Status = @Status, RaisedBy = @RaisedBy, AssignedTo = @AssignedTo,
            UpdatedAt = SYSUTCDATETIME(),
            ResolvedAt = CASE WHEN @Status IN (N'Resolved', N'Closed') THEN COALESCE(ResolvedAt, SYSUTCDATETIME()) ELSE NULL END
        WHERE Id = @Id
      `);

      if (removeIds.length > 0) {
        const del = new sql.Request(tx).input("IssueId", sql.Int, id);
        const placeholders = removeIds.map((imageId, i) => {
          del.input(`Img${i}`, sql.Int, imageId);
          return `@Img${i}`;
        });
        // Only images that belong to this issue can be removed.
        const deleted = await del.query(`
          DELETE FROM dbo.IssueImages
          OUTPUT DELETED.ImagePath
          WHERE IssueId = @IssueId AND ImageId IN (${placeholders.join(", ")})
        `);
        removedPaths = deleted.recordset.map((r) => r.ImagePath as string);
      }

      await insertImageRows(sql, tx, id, saved);
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
    return handleError(err, "update issue");
  }
}

// DELETE /api/issues/[id]
export async function DELETE(_request: NextRequest, ctx: RouteContext<"/api/issues/[id]">) {
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
        .query("DELETE FROM dbo.IssueImages OUTPUT DELETED.ImagePath WHERE IssueId = @Id");
      paths = images.recordset.map((r) => r.ImagePath as string);

      const issue = await new sql.Request(tx).input("Id", sql.Int, id).query("DELETE FROM dbo.Issues WHERE Id = @Id");
      if (issue.rowsAffected[0] === 0) {
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
    return handleError(err, "delete issue");
  }
}
