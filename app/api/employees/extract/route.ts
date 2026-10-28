import { NextRequest, NextResponse } from "next/server";
import { errorResponse, handleError } from "@/lib/api";
import { ExtractError, extractConfig, extractEmployeeRows, type ExtractedRow } from "@/lib/extract";
import { validateImages } from "@/lib/uploads";

const MAX_IMAGES = 5;

// POST /api/employees/extract  (multipart/form-data: "images" = screenshots/photos of the joining sheet)
// Returns the rows read by the AI for review in the browser. Nothing is saved and the images are not stored.
export async function POST(request: NextRequest) {
  try {
    let form: FormData;
    try {
      form = await request.formData();
    } catch {
      return errorResponse("Request must be multipart/form-data.", 400);
    }
    const images = await validateImages(form.getAll("images"));
    if (images.length === 0) return errorResponse("Choose at least one image.", 400);
    if (images.length > MAX_IMAGES) return errorResponse(`Upload at most ${MAX_IMAGES} images at a time.`, 400);

    const { provider, model } = extractConfig(); // fails early with a clear message when no key is set
    const results = await Promise.all(
      images.map(async (img) => ({ source: img.originalName, rows: await extractEmployeeRows(img.buffer) })),
    );

    // Overlapping screenshots repeat people: keep the first copy of each (by email, else name + joining date),
    // filling any cells it is missing from the later copies.
    const merged = new Map<string, { source: string; values: ExtractedRow }>();
    const rows: { source: string; values: ExtractedRow }[] = [];
    for (const { source, rows: found } of results) {
      for (const values of found) {
        const key = values.Email?.toLowerCase() || `${values.DisplayName?.toLowerCase() ?? ""}|${values.DateOfJoining ?? ""}`;
        const first = merged.get(key);
        if (first) {
          for (const k of Object.keys(values) as (keyof ExtractedRow)[]) first.values[k] ??= values[k];
          continue;
        }
        const row = { source, values };
        merged.set(key, row);
        rows.push(row);
      }
    }

    return NextResponse.json({ provider, model, rows });
  } catch (err) {
    if (err instanceof ExtractError) return errorResponse(err.message, err.status);
    return handleError(err, "read the image");
  }
}
