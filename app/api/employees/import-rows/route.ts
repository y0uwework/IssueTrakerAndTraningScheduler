import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError } from "@/lib/api";
import { MAX_IMPORT_ROWS } from "@/lib/employeeExcel";
import { importEmployeeRows } from "@/lib/employeeImport";

// POST /api/employees/import-rows  (JSON: { rows: [{ row, values: {employee columns} }], dryRun?: boolean })
// Saves rows reviewed in the browser (e.g. extracted from an image). With dryRun, only reports what would happen.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) return errorResponse("Request body must be JSON with a rows list.", 400);
    if (body.rows.length === 0) return errorResponse("There are no rows to save.", 400);
    if (body.rows.length > MAX_IMPORT_ROWS) return errorResponse(`At most ${MAX_IMPORT_ROWS} rows can be saved at a time.`, 400);

    const rows = (body.rows as unknown[]).map((item, i) => {
      const r = (item ?? {}) as { row?: unknown; values?: unknown };
      return {
        rowNumber: Number.isInteger(r.row) ? (r.row as number) : i + 1,
        input: r.values && typeof r.values === "object" ? (r.values as Record<string, unknown>) : {},
      };
    });
    return NextResponse.json(await importEmployeeRows(rows, { dryRun: body.dryRun === true }));
  } catch (err) {
    return handleError(err, "save employees");
  }
}
