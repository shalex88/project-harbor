import assert from "node:assert/strict";
import test from "node:test";

import {
  UPLOAD_CHUNK_BYTES,
  uploadChunkKey,
  uploadManifestKey,
} from "../lib/chunked-upload.ts";
import { createFileUploadService } from "../lib/file-upload-service.ts";

const owner = { email: "owner@example.com", displayName: "Owner" };
const stranger = { email: "stranger@example.com", displayName: "Stranger" };
const target = { itemId: "item-1" };
const descriptor = {
  ...target,
  filename: "plans.pdf",
  contentType: "application/pdf",
  sizeBytes: UPLOAD_CHUNK_BYTES + 3,
};

function harness() {
  const objects = new Map();
  const events = [];
  let uuidIndex = 0;
  let metadataError = null;
  const uuids = [
    "5a6cf3ea-1cee-4e33-9486-80e3f03db343",
    "a455c6df-23ca-4868-bbb9-f31537f4ba78",
  ];
  const dependencies = {
    authorizeTarget: async (identity, requestedTarget) => {
      events.push(`authorize:${identity.email}`);
      if (identity.email === stranger.email) throw new Error("forbidden");
      assert.deepEqual(requestedTarget, target);
      return { projectId: "project-1" };
    },
    putBytes: async (key, bytes) => {
      events.push(`put:${key}`);
      objects.set(key, new Uint8Array(bytes));
    },
    readBytes: async (key) => {
      events.push(`read:${key}`);
      return objects.get(key) ?? null;
    },
    listObjectKeys: async () => ({ keys: [], cursor: null }),
    deleteObjectsBestEffort: async (keys) => {
      events.push(`delete:${keys.join(",")}`);
      for (const key of keys) objects.delete(key);
    },
    createMetadata: async (input) => {
      events.push("metadata");
      if (metadataError) throw metadataError;
      return { replacedR2Key: input.paymentId ? "old-receipt" : null };
    },
    loadSnapshot: async () => {
      events.push("snapshot");
      return { generatedAt: "2026-07-27T12:00:00.000Z" };
    },
    randomUUID: () => uuids[uuidIndex++],
    now: () => new Date("2026-07-27T12:00:00.000Z"),
  };
  return {
    dependencies,
    objects,
    events,
    service: createFileUploadService(dependencies),
    failMetadata(error) {
      metadataError = error;
    },
  };
}

async function initiateAndStore(h) {
  const initiated = await h.service.initiate(owner, descriptor);
  const first = new Uint8Array(UPLOAD_CHUNK_BYTES).fill(3);
  const last = new Uint8Array([7, 8, 9]);
  await h.service.storeChunk(owner, initiated.uploadId, 0, first);
  await h.service.storeChunk(owner, initiated.uploadId, 1, last);
  return { initiated, first, last };
}

test("initiates, stores exact chunks, and completes in storage-before-metadata order", async () => {
  const h = harness();
  const { initiated, first, last } = await initiateAndStore(h);
  assert.equal(initiated.chunkSize, UPLOAD_CHUNK_BYTES);

  const snapshot = await h.service.complete(owner, initiated.uploadId);
  assert.deepEqual(snapshot, { generatedAt: "2026-07-27T12:00:00.000Z" });

  const finalKey = "projects/project-1/a455c6df-23ca-4868-bbb9-f31537f4ba78";
  const finalBytes = h.objects.get(finalKey);
  assert.equal(finalBytes.byteLength, descriptor.sizeBytes);
  assert.deepEqual(finalBytes.slice(0, 3), first.slice(0, 3));
  assert.deepEqual(finalBytes.slice(-3), last);
  assert.ok(h.events.indexOf(`put:${finalKey}`) < h.events.indexOf("metadata"));
  assert.equal(h.objects.has(uploadManifestKey(initiated.uploadId)), false);
  assert.equal(h.objects.has(uploadChunkKey(initiated.uploadId, 0)), false);
});

test("rejects another identity and incorrectly sized chunks before writing", async () => {
  const h = harness();
  const initiated = await h.service.initiate(owner, descriptor);
  const before = h.objects.size;
  await assert.rejects(
    () =>
      h.service.storeChunk(
        stranger,
        initiated.uploadId,
        0,
        new Uint8Array(UPLOAD_CHUNK_BYTES),
      ),
    /upload/i,
  );
  await assert.rejects(
    () =>
      h.service.storeChunk(
        owner,
        initiated.uploadId,
        0,
        new Uint8Array(12),
      ),
    /chunk/i,
  );
  assert.equal(h.objects.size, before);
});

test("missing chunks never create metadata and remove temporary objects", async () => {
  const h = harness();
  const initiated = await h.service.initiate(owner, descriptor);
  await h.service.storeChunk(
    owner,
    initiated.uploadId,
    0,
    new Uint8Array(UPLOAD_CHUNK_BYTES),
  );
  await assert.rejects(
    () => h.service.complete(owner, initiated.uploadId),
    /incomplete/i,
  );
  assert.equal(h.events.includes("metadata"), false);
  assert.equal(h.objects.has(uploadManifestKey(initiated.uploadId)), false);
});

test("metadata failure rolls back the final object and temporary objects", async () => {
  const h = harness();
  const { initiated } = await initiateAndStore(h);
  h.failMetadata(new Error("database unavailable"));
  await assert.rejects(
    () => h.service.complete(owner, initiated.uploadId),
    /database unavailable/,
  );
  assert.equal(h.objects.size, 0);
});

test("cancellation requires ownership and removes a session", async () => {
  const h = harness();
  const initiated = await h.service.initiate(owner, descriptor);
  await assert.rejects(
    () => h.service.cancel(stranger, initiated.uploadId),
    /upload/i,
  );
  assert.equal(h.objects.has(uploadManifestKey(initiated.uploadId)), true);
  await h.service.cancel(owner, initiated.uploadId);
  assert.equal(h.objects.has(uploadManifestKey(initiated.uploadId)), false);
});

test("expired cleanup is bounded to manifest listings", async () => {
  const h = harness();
  const uploadId = "5a6cf3ea-1cee-4e33-9486-80e3f03db343";
  const manifest = {
    version: 1,
    uploadId,
    identity: owner.email,
    projectId: "project-1",
    itemId: "item-1",
    paymentId: null,
    filename: "old.pdf",
    contentType: "application/pdf",
    sizeBytes: 1,
    chunkCount: 1,
    createdAt: "2026-07-25T00:00:00.000Z",
  };
  h.objects.set(
    uploadManifestKey(uploadId),
    new TextEncoder().encode(JSON.stringify(manifest)),
  );
  let listing = null;
  const service = createFileUploadService({
    ...h.dependencies,
    listObjectKeys: async (prefix, limit) => {
      listing = { prefix, limit };
      return { keys: [uploadManifestKey(uploadId)], cursor: "next-page" };
    },
  });
  await service.cleanupExpired();
  assert.deepEqual(listing, { prefix: "_upload-manifests/", limit: 50 });
  assert.equal(h.objects.has(uploadManifestKey(uploadId)), false);
});
