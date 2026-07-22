import { requireAppUser } from "@/lib/auth";
import { errorResponse } from "@/lib/http";
import { exportProjectArchive } from "@/lib/project-transfer";
import { downloadHeaders } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  try {
    const identity = await requireAppUser();
    const { projectId } = await context.params;
    const { bytes, filename } = await exportProjectArchive(identity, projectId);
    return new Response(bytes, {
      headers: downloadHeaders({
        filename,
        contentType: "application/zip",
        sizeBytes: bytes.byteLength,
      }),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
