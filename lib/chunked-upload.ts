import { DomainError } from "./domain.ts";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const UPLOAD_CHUNK_BYTES = 512 * 1024;

export type UploadSessionManifest = {
  version: 1;
  uploadId: string;
  identity: string;
  projectId: string;
  itemId: string | null;
  paymentId: string | null;
  filename: string;
  contentType: string;
  sizeBytes: number;
  chunkCount: number;
  createdAt: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function invalidManifest(): never {
  throw new DomainError("Upload manifest is invalid");
}

function requiredText(value: unknown, maximum = 320): string {
  if (typeof value !== "string" || !value || value.length > maximum) {
    return invalidManifest();
  }
  return value;
}

function nullableText(value: unknown): string | null {
  if (value === null) return null;
  return requiredText(value);
}

export function expectedChunkCount(sizeBytes: number): number {
  if (
    !Number.isSafeInteger(sizeBytes) ||
    sizeBytes <= 0 ||
    sizeBytes > MAX_UPLOAD_BYTES
  ) {
    throw new DomainError("Upload size is invalid");
  }
  return Math.ceil(sizeBytes / UPLOAD_CHUNK_BYTES);
}

export function expectedChunkSize(sizeBytes: number, index: number): number {
  const count = expectedChunkCount(sizeBytes);
  if (!Number.isSafeInteger(index) || index < 0 || index >= count) {
    throw new DomainError("Upload chunk index is invalid");
  }
  return index === count - 1
    ? sizeBytes - UPLOAD_CHUNK_BYTES * index
    : UPLOAD_CHUNK_BYTES;
}

export async function readUploadChunk(
  request: Pick<Request, "headers" | "body">,
): Promise<Uint8Array> {
  const declaredLength = request.headers.get("Content-Length");
  let declaredSize: number | null = null;
  if (declaredLength !== null) {
    const size = Number(declaredLength);
    if (
      !/^[1-9]\d*$/.test(declaredLength) ||
      !Number.isSafeInteger(size) ||
      size > UPLOAD_CHUNK_BYTES
    ) {
      throw new DomainError("Upload chunk size is invalid");
    }
    declaredSize = size;
  }
  if (!request.body) throw new DomainError("Upload chunk size is invalid");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > UPLOAD_CHUNK_BYTES) {
      await reader.cancel();
      throw new DomainError("Upload chunk size is invalid");
    }
    chunks.push(value);
  }
  if (size === 0) throw new DomainError("Upload chunk size is invalid");
  if (declaredSize !== null && declaredSize !== size) {
    throw new DomainError("Upload chunk size is invalid");
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export function uploadManifestKey(uploadId: string): string {
  if (!UUID_PATTERN.test(uploadId)) invalidManifest();
  return `_upload-manifests/${uploadId}.json`;
}

export function uploadChunkKey(uploadId: string, index: number): string {
  if (!UUID_PATTERN.test(uploadId)) invalidManifest();
  if (!Number.isSafeInteger(index) || index < 0 || index > 999_999) {
    throw new DomainError("Upload chunk index is invalid");
  }
  return `_upload-parts/${uploadId}/${String(index).padStart(6, "0")}`;
}

export function uploadClaimKey(uploadId: string): string {
  if (!UUID_PATTERN.test(uploadId)) invalidManifest();
  return `_upload-claims/${uploadId}.txt`;
}

export function parseUploadSessionManifest(
  input: unknown,
): UploadSessionManifest {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return invalidManifest();
  }
  const value = input as Record<string, unknown>;
  const keys = Object.keys(value).sort();
  const expectedKeys = [
    "chunkCount",
    "contentType",
    "createdAt",
    "filename",
    "identity",
    "itemId",
    "paymentId",
    "projectId",
    "sizeBytes",
    "uploadId",
    "version",
  ].sort();
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index])
  ) {
    return invalidManifest();
  }

  const uploadId = requiredText(value.uploadId);
  if (!UUID_PATTERN.test(uploadId) || value.version !== 1) {
    return invalidManifest();
  }
  const itemId = nullableText(value.itemId);
  const paymentId = nullableText(value.paymentId);
  if (Boolean(itemId) === Boolean(paymentId)) return invalidManifest();
  if (
    !Number.isSafeInteger(value.sizeBytes) ||
    (value.sizeBytes as number) <= 0 ||
    (value.sizeBytes as number) > MAX_UPLOAD_BYTES
  ) {
    return invalidManifest();
  }
  const sizeBytes = value.sizeBytes as number;
  if (value.chunkCount !== expectedChunkCount(sizeBytes)) {
    return invalidManifest();
  }
  const createdAt = requiredText(value.createdAt);
  if (!Number.isFinite(Date.parse(createdAt))) return invalidManifest();

  return {
    version: 1,
    uploadId,
    identity: requiredText(value.identity),
    projectId: requiredText(value.projectId),
    itemId,
    paymentId,
    filename: requiredText(value.filename, 160),
    contentType: requiredText(value.contentType),
    sizeBytes,
    chunkCount: value.chunkCount as number,
    createdAt,
  };
}

export function assembleUploadChunks(
  manifest: UploadSessionManifest,
  chunks: Uint8Array[],
): Uint8Array {
  const validated = parseUploadSessionManifest(manifest);
  if (chunks.length !== validated.chunkCount) {
    throw new DomainError("Upload chunks are incomplete");
  }
  const bytes = new Uint8Array(validated.sizeBytes);
  let offset = 0;
  for (let index = 0; index < chunks.length; index += 1) {
    const chunk = chunks[index];
    if (
      !(chunk instanceof Uint8Array) ||
      chunk.byteLength !== expectedChunkSize(validated.sizeBytes, index)
    ) {
      throw new DomainError("Upload chunk size is invalid");
    }
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if (offset !== validated.sizeBytes) {
    throw new DomainError("Upload chunks are incomplete");
  }
  return bytes;
}
