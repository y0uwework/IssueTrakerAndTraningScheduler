import { readFile } from "node:fs/promises";
import { NextRequest } from "next/server";
import ExcelJS from "exceljs";
import sharp from "sharp";
import { getDb } from "@/lib/db";
import { buildIssueFilter, handleError } from "@/lib/api";
import { resolveUploadPath } from "@/lib/uploads";

const THUMB_W = 160; // max thumbnail box in pixels
const THUMB_H = 110;
const GAP = 6;
const EMU_PER_PX = 9525; // Excel drawing units
const DATE_FORMAT = "dd-mmm-yyyy hh:mm";

interface Thumb {
  buffer: Buffer;
  width: number;
  height: number;
}

// Excel has no time zones: shift UTC timestamps so the sheet shows this PC's local time.
function localDate(value: Date | null) {
  return value ? new Date(value.getTime() - value.getTimezoneOffset() * 60000) : null;
}

// Excel cannot embed WebP, so every screenshot becomes a small PNG thumbnail.
async function makeThumb(relativePath: string): Promise<Thumb | null> {
  const absolute = resolveUploadPath(relativePath);
  if (!absolute) return null;
  try {
    const { data, info } = await sharp(await readFile(absolute))
      .rotate()
      .resize({ width: THUMB_W, height: THUMB_H, fit: "inside", withoutEnlargement: true })
      .png()
      .toBuffer({ resolveWithObject: true });
    return { buffer: data, width: info.width, height: info.height };
  } catch (err) {
    console.error(`Could not add image ${absolute} to export:`, err);
    return null;
  }
}

// GET /api/issues/export?<same filters as /api/issues>  -> .xlsx download
export async function GET(request: NextRequest) {
  try {
    const { sql, pool } = await getDb();
    const req = pool.request();
    const { whereSql, orderSql } = buildIssueFilter(sql, req, request.nextUrl.searchParams);

    const result = await req.query(`
      SELECT i.Id, i.Title, i.App, i.Description, i.Category, i.Priority, i.Status, i.RaisedBy, i.AssignedTo,
             i.RaisedAt, i.UpdatedAt, i.ResolvedAt
      FROM dbo.Issues i
      ${whereSql}
      ${orderSql};

      SELECT im.IssueId, im.ImagePath
      FROM dbo.IssueImages im
      WHERE im.IssueId IN (SELECT i.Id FROM dbo.Issues i ${whereSql})
      ORDER BY im.IssueId, im.ImageId;
    `);
    const [issues, images] = result.recordsets as Record<string, unknown>[][];

    const imagesByIssue = new Map<number, string[]>();
    for (const img of images) {
      const list = imagesByIssue.get(img.IssueId as number) ?? [];
      list.push(img.ImagePath as string);
      imagesByIssue.set(img.IssueId as number, list);
    }

    const workbook = new ExcelJS.Workbook();
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Issues", { views: [{ state: "frozen", ySplit: 1 }] });

    sheet.columns = [
      { header: "ID", key: "Id", width: 7 },
      { header: "Title", key: "Title", width: 36 },
      { header: "App", key: "App", width: 8 },
      { header: "Category", key: "Category", width: 16 },
      { header: "Priority", key: "Priority", width: 10 },
      { header: "Status", key: "Status", width: 12 },
      { header: "Raised By", key: "RaisedBy", width: 16 },
      { header: "Assigned To", key: "AssignedTo", width: 16 },
      { header: "Raised At", key: "RaisedAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "Updated At", key: "UpdatedAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "Resolved At", key: "ResolvedAt", width: 18, style: { numFmt: DATE_FORMAT } },
      { header: "Description", key: "Description", width: 50 },
      { header: "Screenshots", key: "Screenshots", width: 24 },
    ];
    const imageCol = sheet.columns.length - 1; // zero-based index of the last column

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF334155" } };
    header.alignment = { vertical: "middle" };
    header.height = 22;

    let widestRowPx = 0;
    for (const issue of issues) {
      const paths = imagesByIssue.get(issue.Id as number) ?? [];
      const row = sheet.addRow({
        ...issue,
        RaisedAt: localDate(issue.RaisedAt as Date),
        UpdatedAt: localDate(issue.UpdatedAt as Date),
        ResolvedAt: localDate(issue.ResolvedAt as Date | null),
        Screenshots: paths.length ? "" : "No screenshots",
      });
      row.alignment = { vertical: "top", wrapText: true };
      if (issue.Priority === "Critical") row.getCell("Priority").font = { bold: true, color: { argb: "FFDC2626" } };

      const thumbs = (await Promise.all(paths.map(makeThumb))).filter((t): t is Thumb => t !== null);
      if (thumbs.length === 0) continue;

      row.height = ((THUMB_H + GAP * 2) * 3) / 4; // points
      let x = GAP;
      for (const thumb of thumbs) {
        const imageId = workbook.addImage({ buffer: thumb.buffer as unknown as ExcelJS.Buffer, extension: "png" });
        sheet.addImage(imageId, {
          tl: { nativeCol: imageCol, nativeColOff: x * EMU_PER_PX, nativeRow: row.number - 1, nativeRowOff: GAP * EMU_PER_PX },
          ext: { width: thumb.width, height: thumb.height },
          editAs: "oneCell",
        } as unknown as ExcelJS.ImageRange);
        x += thumb.width + GAP;
      }
      widestRowPx = Math.max(widestRowPx, x);
    }

    // Widen the screenshot column so every thumbnail in the busiest row fits (~7 px per character).
    if (widestRowPx > 0) sheet.getColumn(imageCol + 1).width = Math.min(255, Math.ceil(widestRowPx / 7) + 1);
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };

    const buffer = await workbook.xlsx.writeBuffer();
    const stamp = localDate(new Date())!.toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
    return new Response(new Uint8Array(buffer as ArrayBuffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="issues_${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return handleError(err, "export issues");
  }
}
