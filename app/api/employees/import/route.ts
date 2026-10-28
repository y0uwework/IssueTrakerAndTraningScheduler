import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError } from "@/lib/api";
import { MAX_IMPORT_ROWS, readEmployeeSheet } from "@/lib/employeeExcel";
import { importEmployeeRows } from "@/lib/employeeImport";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

// POST /api/employees/import  (multipart/form-data: "file" = .xlsx in the new-joiner sheet layout)
export async function POST(request: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("Request must be multipart/form-data.", 400);
    }
    const file = form.get("file");
    if (!file || typeof file === "string" || file.size === 0) return errorResponse("Choose an Excel (.xlsx) file to import.", 400);
    if (file.size > MAX_FILE_BYTES) return errorResponse("The file is larger than 5 MB.", 400);

    const buffer = Buffer.from(await file.arrayBuffer());
    // .xlsx files are ZIP archives ("PK"); old .xls files are not supported by the reader.
    if (buffer.length < 4 || buffer.toString("ascii", 0, 2) !== "PK") {
      return errorResponse("Only .xlsx files can be imported. In Excel use File > Save As > Excel Workbook (.xlsx).", 400);
    }

    let rows;
    try {
      rows = await readEmployeeSheet(buffer);
    } catch (err) {
      return errorResponse(err instanceof Error && err.message.startsWith("No sheet") ? err.message : "The file could not be read as an Excel workbook.", 400);
    }
    if (rows.length === 0) return errorResponse("The sheet has a header row but no employee rows.", 400);
    if (rows.length > MAX_IMPORT_ROWS) return errorResponse(`At most ${MAX_IMPORT_ROWS} rows can be imported at a time.`, 400);

    return NextResponse.json(await importEmployeeRows(rows));
  } catch (err) {
    return handleError(err, "import employees");
  }
}
