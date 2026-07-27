import { requireAppUser } from "@/lib/auth";
import { readUploadChunk } from "@/lib/chunked-upload";
import { DomainError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
import { createFileUploadService } from "@/lib/file-upload-service";
import {
  authorizeFileTarget,
  createFileMetadata,
  deleteFileMetadata,
  getFileContext,
  getUserByIdentity,
  loadWorkspaceSnapshot,
  requireProjectAccess,
} from "@/lib/repository";
import {
  deleteObjectsBestEffort,
  claimUpload,
  downloadHeaders,
  getObject,
  listObjectKeys,
  putObjectBytes,
  readObjectBytes,
} from "@/lib/storage";

export const dynamic = "force-dynamic";

const fileUploadService = createFileUploadService({
  authorizeTarget: authorizeFileTarget,
  putBytes: putObjectBytes,
  readBytes: readObjectBytes,
  listObjectKeys,
  claimUpload,
  deleteObjectsBestEffort,
  createMetadata: createFileMetadata,
  loadSnapshot: loadWorkspaceSnapshot,
  randomUUID: () => crypto.randomUUID(),
  now: () => new Date(),
});

export async function GET(request: Request) {
  try {
    const identity = await requireAppUser();
    const fileId = new URL(request.url).searchParams.get("id");
    if (!fileId) throw new DomainError("File is required");
    const user = await getUserByIdentity(identity);
    const context = await getFileContext(fileId);
    await requireProjectAccess(user.id, context.projectId);
    const object = await getObject(context.r2Key);
    if (!object) throw new DomainError("File not found", "not_found");
    return new Response(object.body, {
      headers: downloadHeaders(context),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const identity = await requireAppUser();
    const url = new URL(request.url);
    const stage = url.searchParams.get("stage");
    if (stage === "init") {
      const body = (await request.json()) as {
        itemId?: unknown;
        paymentId?: unknown;
        filename?: unknown;
        contentType?: unknown;
        sizeBytes?: unknown;
      };
      if (
        (body.itemId !== undefined && typeof body.itemId !== "string") ||
        (body.paymentId !== undefined && typeof body.paymentId !== "string") ||
        typeof body.filename !== "string" ||
        typeof body.contentType !== "string" ||
        typeof body.sizeBytes !== "number"
      ) {
        throw new DomainError("Upload details are invalid");
      }
      return Response.json(
        await fileUploadService.initiate(identity, {
          ...(body.itemId ? { itemId: body.itemId } : {}),
          ...(body.paymentId ? { paymentId: body.paymentId } : {}),
          filename: body.filename,
          contentType: body.contentType,
          sizeBytes: body.sizeBytes,
        }),
        { status: 201 },
      );
    }
    const uploadId = url.searchParams.get("uploadId");
    if (!uploadId) throw new DomainError("Upload is required");
    if (stage === "chunk") {
      const rawIndex = url.searchParams.get("index");
      if (!rawIndex || !/^(0|[1-9]\d*)$/.test(rawIndex)) {
        throw new DomainError("Upload chunk index is invalid");
      }
      await fileUploadService.storeChunk(
        identity,
        uploadId,
        Number(rawIndex),
        await readUploadChunk(request),
      );
      return Response.json({ ok: true });
    }
    if (stage === "complete") {
      return Response.json(
        await fileUploadService.complete(identity, uploadId),
        { status: 201 },
      );
    }
    throw new DomainError("Upload stage is invalid");
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireAppUser();
    const url = new URL(request.url);
    const uploadId = url.searchParams.get("uploadId");
    if (uploadId) {
      await fileUploadService.cancel(identity, uploadId);
      return Response.json({ ok: true });
    }
    const fileId = url.searchParams.get("id");
    if (!fileId) throw new DomainError("File is required");
    const { r2Key } = await deleteFileMetadata(identity, fileId);
    await deleteObjectsBestEffort([r2Key]);
    return Response.json(await loadWorkspaceSnapshot(identity));
  } catch (error) {
    return errorResponse(error);
  }
}
