import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError } from "@/lib/api";
import { MAX_LEGACY_ROWS, importLegacyTraining } from "@/lib/trainingImport";

// POST /api/training/import  (JSON: { trainers: string[], rows: [{ row, name, email, ..., startAt, endAt, mode, apps }], dryRun?: boolean })
// Saves rows of the old training sheet, reviewed in the browser, as completed training sessions.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !Array.isArray(body.rows)) return errorResponse("Request body must be JSON with a rows list.", 400);
    if (body.rows.length === 0) return errorResponse("There are no rows to save.", 400);
    if (body.rows.length > MAX_LEGACY_ROWS) return errorResponse(`At most ${MAX_LEGACY_ROWS} rows can be saved at a time.`, 400);
    return NextResponse.json(await importLegacyTraining(body.rows, body.trainers, { dryRun: body.dryRun === true }));
  } catch (err) {
    return handleError(err, "import training records");
  }
}
