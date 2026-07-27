import type { IdentityUser } from "./auth.ts";
import {
  UPLOAD_CHUNK_BYTES,
  assembleUploadChunks,
  expectedChunkCount,
  expectedChunkSize,
  parseUploadSessionManifest,
  uploadChunkKey,
  uploadManifestKey,
  type UploadSessionManifest,
} from "./chunked-upload.ts";
import { DomainError, type WorkspaceSnapshot } from "./domain.ts";
import { validateUpload } from "./upload-policy.ts";

type UploadTarget = { itemId?: string; paymentId?: string };

type InitiateInput = UploadTarget & {
  filename: string;
  contentType: string;
  sizeBytes: number;
};

type FileUploadDependencies = {
  authorizeTarget(
    identity: IdentityUser,
    target: UploadTarget,
  ): Promise<{ projectId: string }>;
  putBytes(
    key: string,
    bytes: Uint8Array,
    contentType: string,
  ): Promise<void>;
  readBytes(key: string): Promise<Uint8Array | null>;
  listObjectKeys(
    prefix: string,
    limit: number,
    cursor?: string,
  ): Promise<{ keys: string[]; cursor: string | null }>;
  claimUpload(uploadId: string, createdAt: string): Promise<boolean>;
  deleteObjectsBestEffort(keys: string[]): Promise<void>;
  createMetadata(input: {
    identity: IdentityUser;
    itemId?: string;
    paymentId?: string;
    fileId: string;
    r2Key: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
  }): Promise<{ replacedR2Key: string | null }>;
  loadSnapshot(identity: IdentityUser): Promise<WorkspaceSnapshot>;
  randomUUID(): string;
  now(): Date;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const MANIFEST_PREFIX = "_upload-manifests/";
const CLAIM_PREFIX = "_upload-claims/";
const EXPIRES_AFTER_MS = 24 * 60 * 60 * 1000;
const CLEANUP_PAGE_SIZE = 50;

function normalizedIdentity(identity: IdentityUser): string {
  return identity.email.trim().toLowerCase();
}

function targetFromManifest(manifest: UploadSessionManifest): UploadTarget {
  return manifest.itemId
    ? { itemId: manifest.itemId }
    : { paymentId: manifest.paymentId ?? undefined };
}

function uploadKeys(manifest: UploadSessionManifest): string[] {
  const keys = [uploadManifestKey(manifest.uploadId)];
  for (let index = 0; index < manifest.chunkCount; index += 1) {
    keys.push(uploadChunkKey(manifest.uploadId, index));
  }
  return keys;
}

function uploadError(): never {
  throw new DomainError("Upload session is invalid or expired");
}

export function createFileUploadService(dependencies: FileUploadDependencies) {
  async function readManifest(uploadId: string): Promise<UploadSessionManifest> {
    const bytes = await dependencies.readBytes(uploadManifestKey(uploadId));
    if (!bytes) return uploadError();
    try {
      const manifest = parseUploadSessionManifest(
        JSON.parse(decoder.decode(bytes)),
      );
      if (
        dependencies.now().getTime() - Date.parse(manifest.createdAt) >=
        EXPIRES_AFTER_MS
      ) {
        await cleanupManifest(manifest);
        return uploadError();
      }
      return manifest;
    } catch {
      return uploadError();
    }
  }

  async function authorizeManifest(
    identity: IdentityUser,
    manifest: UploadSessionManifest,
  ): Promise<void> {
    if (normalizedIdentity(identity) !== manifest.identity) return uploadError();
    const target = targetFromManifest(manifest);
    const authorized = await dependencies.authorizeTarget(identity, target);
    if (authorized.projectId !== manifest.projectId) return uploadError();
  }

  async function cleanupManifest(manifest: UploadSessionManifest): Promise<void> {
    await dependencies.deleteObjectsBestEffort(uploadKeys(manifest));
  }

  async function cleanupExpired(): Promise<void> {
    const listed = await dependencies.listObjectKeys(
      MANIFEST_PREFIX,
      CLEANUP_PAGE_SIZE,
    );
    for (const key of listed.keys) {
      const bytes = await dependencies.readBytes(key);
      if (!bytes) continue;
      let manifest: UploadSessionManifest;
      try {
        manifest = parseUploadSessionManifest(JSON.parse(decoder.decode(bytes)));
      } catch {
        await dependencies.deleteObjectsBestEffort([key]);
        continue;
      }
      if (
        dependencies.now().getTime() - Date.parse(manifest.createdAt) >=
        EXPIRES_AFTER_MS
      ) {
        await cleanupManifest(manifest);
      }
    }
    const claims = await dependencies.listObjectKeys(
      CLAIM_PREFIX,
      CLEANUP_PAGE_SIZE,
    );
    for (const key of claims.keys) {
      const bytes = await dependencies.readBytes(key);
      if (!bytes) continue;
      const createdAt = decoder.decode(bytes);
      if (
        !Number.isFinite(Date.parse(createdAt)) ||
        dependencies.now().getTime() - Date.parse(createdAt) >=
          EXPIRES_AFTER_MS
      ) {
        await dependencies.deleteObjectsBestEffort([key]);
      }
    }
  }

  async function initiate(
    identity: IdentityUser,
    input: InitiateInput,
  ): Promise<{ uploadId: string; chunkSize: number }> {
    const itemId = typeof input.itemId === "string" ? input.itemId : undefined;
    const paymentId =
      typeof input.paymentId === "string" ? input.paymentId : undefined;
    if (Boolean(itemId) === Boolean(paymentId)) {
      throw new DomainError("Choose exactly one item or payment target");
    }
    const target = itemId ? { itemId } : { paymentId };
    const authorized = await dependencies.authorizeTarget(identity, target);
    const policy = validateUpload(
      {
        name: input.filename,
        type: input.contentType,
        size: input.sizeBytes,
      },
      paymentId ? "receipt" : "item",
    );
    const uploadId = dependencies.randomUUID();
    const manifest: UploadSessionManifest = {
      version: 1,
      uploadId,
      identity: normalizedIdentity(identity),
      projectId: authorized.projectId,
      itemId: itemId ?? null,
      paymentId: paymentId ?? null,
      filename: policy.filename,
      contentType: policy.contentType,
      sizeBytes: policy.sizeBytes,
      chunkCount: expectedChunkCount(policy.sizeBytes),
      createdAt: dependencies.now().toISOString(),
    };
    parseUploadSessionManifest(manifest);
    try {
      await cleanupExpired();
    } catch {
      // Expired-session cleanup must not block a new upload.
    }
    await dependencies.putBytes(
      uploadManifestKey(uploadId),
      encoder.encode(JSON.stringify(manifest)),
      "application/json",
    );
    return { uploadId, chunkSize: UPLOAD_CHUNK_BYTES };
  }

  async function storeChunk(
    identity: IdentityUser,
    uploadId: string,
    index: number,
    bytes: Uint8Array,
  ): Promise<void> {
    const manifest = await readManifest(uploadId);
    await authorizeManifest(identity, manifest);
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.byteLength !== expectedChunkSize(manifest.sizeBytes, index)
    ) {
      throw new DomainError("Upload chunk size is invalid");
    }
    await dependencies.putBytes(
      uploadChunkKey(uploadId, index),
      bytes,
      "application/octet-stream",
    );
  }

  async function complete(
    identity: IdentityUser,
    uploadId: string,
  ): Promise<WorkspaceSnapshot> {
    const manifest = await readManifest(uploadId);
    await authorizeManifest(identity, manifest);
    const claimed = await dependencies.claimUpload(
      uploadId,
      dependencies.now().toISOString(),
    );
    if (!claimed) {
      throw new DomainError("Upload is already being completed", "conflict");
    }
    let finalKey: string | null = null;
    let metadataCreated = false;
    try {
      const chunks: Uint8Array[] = [];
      for (let index = 0; index < manifest.chunkCount; index += 1) {
        const chunk = await dependencies.readBytes(
          uploadChunkKey(uploadId, index),
        );
        if (!chunk) throw new DomainError("Upload chunks are incomplete");
        chunks.push(chunk);
      }
      const bytes = assembleUploadChunks(manifest, chunks);
      const fileId = dependencies.randomUUID();
      finalKey = `projects/${manifest.projectId}/${fileId}`;
      await dependencies.putBytes(finalKey, bytes, manifest.contentType);
      const { replacedR2Key } = await dependencies.createMetadata({
        identity,
        ...(manifest.itemId ? { itemId: manifest.itemId } : {}),
        ...(manifest.paymentId ? { paymentId: manifest.paymentId } : {}),
        fileId,
        r2Key: finalKey,
        filename: manifest.filename,
        contentType: manifest.contentType,
        sizeBytes: manifest.sizeBytes,
      });
      metadataCreated = true;
      await cleanupManifest(manifest);
      if (replacedR2Key) {
        await dependencies.deleteObjectsBestEffort([replacedR2Key]);
      }
      return await dependencies.loadSnapshot(identity);
    } catch (error) {
      const rollbackKeys = uploadKeys(manifest);
      if (finalKey && !metadataCreated) rollbackKeys.push(finalKey);
      await dependencies.deleteObjectsBestEffort(rollbackKeys);
      throw error;
    }
  }

  async function cancel(
    identity: IdentityUser,
    uploadId: string,
  ): Promise<void> {
    const manifest = await readManifest(uploadId);
    await authorizeManifest(identity, manifest);
    await cleanupManifest(manifest);
  }

  return {
    initiate,
    storeChunk,
    complete,
    cancel,
    cleanupExpired,
  };
}
