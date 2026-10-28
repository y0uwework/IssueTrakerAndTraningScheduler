import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { errorResponse } from "./api";
import { resolveUploadPath } from "./uploads";

const CONTENT_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

/** Streams an uploaded image by its stored relative path, refusing anything outside uploads/. */
export async function serveUploadedImage(relativePath: string | undefined) {
  if (!relativePath) return errorResponse("Image not found.", 404);

  const absolute = resolveUploadPath(relativePath);
  const contentType = CONTENT_TYPES[path.extname(relativePath).toLowerCase()];
  if (!absolute || !contentType) return errorResponse("Image not found.", 404);

  let data: Buffer;
  try {
    data = await readFile(absolute);
  } catch {
    return errorResponse("Image file is missing from the uploads folder.", 404);
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(data.length),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
