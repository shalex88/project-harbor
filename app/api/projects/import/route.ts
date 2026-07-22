import { requireAppUser } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
import {
  importProjectArchive,
  readRequestBytes,
} from "@/lib/project-transfer";
import { MAX_ARCHIVE_BYTES } from "@/lib/project-archive";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const identity = await requireAppUser();
    const contentType = request.headers
      .get("Content-Type")
      ?.split(";", 1)[0]
      .trim()
      .toLowerCase();
    if (
      contentType !== "application/zip" &&
      contentType !== "application/x-zip-compressed"
    ) {
      throw new DomainError("Choose a Harbor ZIP archive");
    }
    const declaredLength = request.headers.get("Content-Length");
    if (declaredLength !== null) {
      const size = Number(declaredLength);
      if (!Number.isSafeInteger(size) || size <= 0) {
        throw new DomainError("Choose a Harbor ZIP archive");
      }
      if (size > MAX_ARCHIVE_BYTES) {
        throw new DomainError("This archive is too large");
      }
    }
    const bytes = await readRequestBytes(request.body, MAX_ARCHIVE_BYTES);
    const result = await importProjectArchive(identity, bytes);
    return Response.json(result, {
      status: 201,
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
