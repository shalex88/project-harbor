import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CHUNK_BYTES,
} from "./chunked-upload.ts";
import type { WorkspaceSnapshot } from "./domain.ts";

type UploadTarget = { itemId?: string; paymentId?: string };
type RequestAdapter = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

type UploadInput = {
  target: UploadTarget;
  file: File;
  request?: RequestAdapter;
  onProgress(value: number): void;
};

async function readResponse<T>(
  response: Response,
  failureMessage = "The upload could not be completed",
  payloadTooLargeMessage: string | null =
    "The upload is too large for Project Harbor",
): Promise<T> {
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    if (
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error?: unknown }).error === "string"
    ) {
      throw new Error((data as { error: string }).error);
    }
    if (response.status === 413 && payloadTooLargeMessage) {
      throw new Error(payloadTooLargeMessage);
    }
    throw new Error(failureMessage);
  }
  if (data === null) throw new Error(failureMessage);
  return data as T;
}

export async function uploadFileInChunks({
  target,
  file,
  request = fetch,
  onProgress,
}: UploadInput): Promise<WorkspaceSnapshot> {
  if (Boolean(target.itemId) === Boolean(target.paymentId)) {
    throw new Error("Choose exactly one item or payment target");
  }
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new Error("Choose a non-empty file");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Files must be 5 MB or smaller");
  }

  onProgress(0);
  let uploadId: string | null = null;
  let completionStarted = false;
  try {
    const initiated = await readResponse<{
      uploadId?: unknown;
      chunkSize?: unknown;
    }>(
      await request("/api/files?stage=init", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...target,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          sizeBytes: file.size,
        }),
      }),
    );
    if (
      typeof initiated.uploadId !== "string" ||
      initiated.chunkSize !== UPLOAD_CHUNK_BYTES
    ) {
      throw new Error("The upload could not be completed");
    }
    uploadId = initiated.uploadId;

    let uploadedBytes = 0;
    let index = 0;
    while (uploadedBytes < file.size) {
      const end = Math.min(uploadedBytes + UPLOAD_CHUNK_BYTES, file.size);
      const chunk = file.slice(uploadedBytes, end);
      await readResponse<{ ok?: boolean }>(
        await request(
          `/api/files?stage=chunk&uploadId=${encodeURIComponent(uploadId)}&index=${index}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/octet-stream" },
            body: chunk,
          },
        ),
      );
      uploadedBytes = end;
      index += 1;
      onProgress(Math.min(99, Math.round((uploadedBytes / file.size) * 100)));
    }

    completionStarted = true;
    const snapshot = await readResponse<WorkspaceSnapshot>(
      await request(
        `/api/files?stage=complete&uploadId=${encodeURIComponent(uploadId)}`,
        { method: "POST" },
      ),
    );
    onProgress(100);
    return snapshot;
  } catch (error) {
    if (uploadId && !completionStarted) {
      try {
        await request(
          `/api/files?uploadId=${encodeURIComponent(uploadId)}`,
          { method: "DELETE" },
        );
      } catch {
        // Cancellation is best-effort and must not hide the upload error.
      }
    }
    throw error;
  }
}

export async function renameUploadedFile({
  fileObjectId,
  baseName,
  request = fetch,
}: {
  fileObjectId: string;
  baseName: string;
  request?: RequestAdapter;
}): Promise<WorkspaceSnapshot> {
  return readResponse<WorkspaceSnapshot>(
    await request(`/api/files?id=${encodeURIComponent(fileObjectId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ baseName }),
    }),
    "The file could not be renamed",
    null,
  );
}
