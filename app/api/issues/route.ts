import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { addIssueInputs, buildIssueFilter, handleError, insertImageRows, parseIssueFields } from "@/lib/api";
import { deleteImageFiles, saveImages, validateImages, type SavedImage } from "@/lib/uploads";
import type { IssueListResponse } from "@/lib/types";

// GET /api/issues?search=&app=&status=&priority=&category=&sort=newest|oldest
export async function GET(request: NextRequest) {
  try {
    const { sql, pool } = await getDb();
    const req = pool.request();
    const { whereSql, orderSql } = buildIssueFilter(sql, req, request.nextUrl.searchParams);

    const result = await req.query(`
      SELECT i.Id, i.Title, i.App, i.Description, i.Category, i.Priority, i.Status, i.RaisedBy, i.AssignedTo,
             i.RaisedAt, i.UpdatedAt, i.ResolvedAt,
             (SELECT COUNT(*) FROM dbo.IssueImages im WHERE im.IssueId = i.Id) AS ImageCount
      FROM dbo.Issues i
      ${whereSql}
      ${orderSql};

      SELECT COUNT(*) AS total,
             COALESCE(SUM(CASE WHEN Status = N'Open' THEN 1 ELSE 0 END), 0) AS [open],
             COALESCE(SUM(CASE WHEN Status = N'In Progress' THEN 1 ELSE 0 END), 0) AS inProgress,
             COALESCE(SUM(CASE WHEN Status = N'Resolved' THEN 1 ELSE 0 END), 0) AS resolved
      FROM dbo.Issues;

      SELECT DISTINCT Category FROM dbo.Issues WHERE Category IS NOT NULL ORDER BY Category;
    `);

    const recordsets = result.recordsets as Record<string, unknown>[][];
    const body: IssueListResponse = {
      issues: recordsets[0] as unknown as IssueListResponse["issues"],
      stats: recordsets[1][0] as unknown as IssueListResponse["stats"],
      categories: recordsets[2].map((r) => r.Category as string),
    };
    return NextResponse.json(body);
  } catch (err) {
    return handleError(err, "load issues");
  }
}

// POST /api/issues  (multipart/form-data: issue fields + "images" files)
export async function POST(request: NextRequest) {
  let saved: SavedImage[] = [];
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return NextResponse.json({ error: "Request must be multipart/form-data." }, { status: 400 });
    }

    const fields = parseIssueFields(form);
    const images = await validateImages(form.getAll("images"));

    const { sql, pool } = await getDb();
    saved = await saveImages(images);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      const inserted = await addIssueInputs(sql, new sql.Request(tx), fields).query(`
        INSERT INTO dbo.Issues (Title, App, Description, Category, Priority, Status, RaisedBy, AssignedTo, ResolvedAt)
        OUTPUT INSERTED.Id
        VALUES (@Title, @App, @Description, @Category, @Priority, @Status, @RaisedBy, @AssignedTo,
                CASE WHEN @Status IN (N'Resolved', N'Closed') THEN SYSUTCDATETIME() ELSE NULL END)
      `);
      const id = inserted.recordset[0].Id as number;
      await insertImageRows(sql, tx, id, saved);
      await tx.commit();
      return NextResponse.json({ id }, { status: 201 });
    } catch (err) {
      await tx.rollback().catch(() => {});
      throw err;
    }
  } catch (err) {
    // Nothing was committed, so remove any files written for this request.
    await deleteImageFiles(saved.map((s) => s.relativePath));
    return handleError(err, "create issue");
  }
}
