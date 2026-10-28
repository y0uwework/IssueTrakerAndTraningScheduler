import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { MAX_IMAGE_BYTES } from "./types";

export const UPLOAD_DIR = path.join(process.cwd(), "uploads");
export const MAX_FILES_PER_REQUEST = 10;

export interface ValidatedImage {
  buffer: Buffer;
  ext: "jpg" | "png" | "webp";
  originalName: string;
}

export interface SavedImage {
  relativePath: string; // e.g. "uploads/2f0c...e1.png" - stored in IssueImages.ImagePath
  originalName: string;
}

export class UploadError extends Error {}

// Identify the format from the file's first bytes (magic numbers), not its name or browser MIME type.
function detectImageType(buf: Buffer): ValidatedImage["ext"] | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.length >= 12 && buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "webp";
  return null;
}

function cleanFileName(name: string): string {
  // Keep only the base name, drop control characters, and fit the NVARCHAR(255) column.
  const base = name.split(/[\\/]/).pop() ?? "";
  return base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 255) || "image";
}

/** Reads and validates every file in a FormData field. Throws UploadError with a readable message. */
export async function validateImages(files: FormDataEntryValue[]): Promise<ValidatedImage[]> {
  const realFiles = files.filter((f): f is File => typeof f !== "string" && f.size > 0);
  if (realFiles.length > MAX_FILES_PER_REQUEST) {
    throw new UploadError(`You can upload at most ${MAX_FILES_PER_REQUEST} images at a time.`);
  }

  const result: ValidatedImage[] = [];
  for (const file of realFiles) {
    const originalName = cleanFileName(file.name);
    if (file.size > MAX_IMAGE_BYTES) {
      throw new UploadError(`"${originalName}" is larger than 5 MB.`);
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = detectImageType(buffer);
    if (!ext) {
      throw new UploadError(`"${originalName}" is not a valid JPEG, PNG, or WebP image.`);
    }
    result.push({ buffer, ext, originalName });
  }
  return result;
}

/** Writes validated images under uploads/ with random names. Cleans up partial writes on failure. */
export async function saveImages(images: ValidatedImage[]): Promise<SavedImage[]> {
  if (images.length === 0) return [];
  await mkdir(UPLOAD_DIR, { recursive: true });

  const saved: SavedImage[] = [];
  try {
    for (const img of images) {
      const fileName = `${randomUUID()}.${img.ext}`;
      await writeFile(path.join(UPLOAD_DIR, fileName), img.buffer, { flag: "wx" });
      saved.push({ relativePath: `uploads/${fileName}`, originalName: img.originalName });
    }
  } catch (err) {
    await deleteImageFiles(saved.map((s) => s.relativePath));
    throw err;
  }
  return saved;
}

/** Resolves a stored relative path to an absolute path, refusing anything outside uploads/. */
export function resolveUploadPath(relativePath: string): string | null {
  // Only names this app generates are accepted: uploads/<uuid>.<jpg|png|webp>
  const match = /^uploads\/([0-9a-f-]{36}\.(?:jpg|png|webp))$/.exec(relativePath);
  return match ? path.join(UPLOAD_DIR, match[1]) : null;
}

/** Best-effort removal of image files; missing files are ignored. */
export async function deleteImageFiles(relativePaths: string[]) {
  await Promise.all(
    relativePaths.map(async (rel) => {
      const absolute = resolveUploadPath(rel);
      if (!absolute) return;
      try {
        await unlink(absolute);
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
          console.error(`Could not delete image file ${absolute}:`, err);
        }
      }
    }),
  );
}
