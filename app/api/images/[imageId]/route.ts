import { NextRequest } from "next/server";
import { getDb } from "@/lib/db";
import { errorResponse, handleError, parseId } from "@/lib/api";
import { serveUploadedImage } from "@/lib/serveImage";

// GET /api/images/[imageId] - serves only files that are registered in IssueImages and live inside uploads/.
export async function GET(_request: NextRequest, ctx: RouteContext<"/api/images/[imageId]">) {
  const imageId = parseId((await ctx.params).imageId);
  if (!imageId) return errorResponse("Invalid image ID.", 400);

  try {
    const { sql, pool } = await getDb();
    const result = await pool
      .request()
      .input("ImageId", sql.Int, imageId)
      .query("SELECT ImagePath FROM dbo.IssueImages WHERE ImageId = @ImageId");
    return await serveUploadedImage(result.recordset[0]?.ImagePath);
  } catch (err) {
    return handleError(err, "load image");
  }
}
