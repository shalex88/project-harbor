import { requireAppUser } from "@/lib/auth";
import { DomainError } from "@/lib/domain";
import { errorResponse } from "@/lib/http";
import {
  authorizeFileTarget,
  createFileMetadata,
  deleteFileMetadata,
  getFileContext,
  getUserByIdentity,
  loadWorkspaceSnapshot,
  requireProjectAccess,
  setItemFilePinned,
} from "@/lib/repository";
import {
  deleteObjectsBestEffort,
  downloadHeaders,
  getObject,
  putObject,
} from "@/lib/storage";
import { validateUpload } from "@/lib/upload-policy";

export const dynamic = "force-dynamic";

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
  let uploadedKey: string | null = null;
  try {
    const identity = await requireAppUser();
    const url = new URL(request.url);
    const itemId = url.searchParams.get("itemId") ?? undefined;
    const paymentId = url.searchParams.get("paymentId") ?? undefined;
    if (Boolean(itemId) === Boolean(paymentId)) {
      throw new DomainError("Choose exactly one item or payment target");
    }
    const target = await authorizeFileTarget(identity, { itemId, paymentId });
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new DomainError("Choose a file");
    const policy = validateUpload(file, paymentId ? "receipt" : "item");
    const fileId = crypto.randomUUID();
    uploadedKey = `projects/${target.projectId}/${fileId}`;
    await putObject(uploadedKey, file, policy.contentType);
    const { replacedR2Key } = await createFileMetadata({
      identity,
      itemId,
      paymentId,
      fileId,
      r2Key: uploadedKey,
      filename: policy.filename,
      contentType: policy.contentType,
      sizeBytes: policy.sizeBytes,
    });
    uploadedKey = null;
    if (replacedR2Key) {
      await deleteObjectsBestEffort([replacedR2Key]);
    }
    return Response.json(await loadWorkspaceSnapshot(identity), { status: 201 });
  } catch (error) {
    if (uploadedKey) await deleteObjectsBestEffort([uploadedKey]);
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const identity = await requireAppUser();
    const body = (await request.json()) as {
      itemFileId?: unknown;
      pinned?: unknown;
    };
    if (typeof body.itemFileId !== "string") {
      throw new DomainError("File is required");
    }
    if (typeof body.pinned !== "boolean") {
      throw new DomainError("Pinned state is required");
    }
    await setItemFilePinned(identity, body.itemFileId, body.pinned);
    return Response.json(await loadWorkspaceSnapshot(identity));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await requireAppUser();
    const fileId = new URL(request.url).searchParams.get("id");
    if (!fileId) throw new DomainError("File is required");
    const { r2Key } = await deleteFileMetadata(identity, fileId);
    await deleteObjectsBestEffort([r2Key]);
    return Response.json(await loadWorkspaceSnapshot(identity));
  } catch (error) {
    return errorResponse(error);
  }
}
