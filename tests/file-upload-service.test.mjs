import assert from "node:assert/strict";
import test from "node:test";

import {
  UPLOAD_CHUNK_BYTES,
  uploadClaimKey,
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

function deferred() {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function harness() {
  const objects = new Map();
  const events = [];
  let uuidIndex = 0;
  let metadataError = null;
  const claims = new Set();
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
    claimUpload: async (uploadId) => {
      const key = uploadClaimKey(uploadId);
      if (claims.has(key)) return false;
      claims.add(key);
      objects.set(key, new TextEncoder().encode("2026-07-27T12:00:00.000Z"));
      return true;
    },
    deleteObjectsBestEffort: async (keys) => {
      events.push(`delete:${keys.join(",")}`);
      for (const key of keys) {
        objects.delete(key);
        claims.delete(key);
      }
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
    claims,
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
  assert.equal(h.objects.has(uploadClaimKey(initiated.uploadId)), false);
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

test("rejects a manifest whose embedded upload id differs from its storage key", async () => {
  const h = harness();
  const requestedId = "5a6cf3ea-1cee-4e33-9486-80e3f03db343";
  const embeddedId = "a455c6df-23ca-4868-bbb9-f31537f4ba78";
  h.objects.set(
    uploadManifestKey(requestedId),
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        uploadId: embeddedId,
        identity: owner.email,
        projectId: "project-1",
        itemId: "item-1",
        paymentId: null,
        filename: "plans.pdf",
        contentType: "application/pdf",
        sizeBytes: 1,
        chunkCount: 1,
        createdAt: "2026-07-27T12:00:00.000Z",
      }),
    ),
  );

  await assert.rejects(
    () => h.service.storeChunk(owner, requestedId, 0, new Uint8Array([1])),
    /upload/i,
  );
  assert.equal(h.objects.has(uploadChunkKey(embeddedId, 0)), false);
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
  const rollbackStarted = deferred();
  const releaseRollback = deferred();
  const manifestKey = uploadManifestKey(initiated.uploadId);
  const claimKey = uploadClaimKey(initiated.uploadId);
  let rollbackFinished = false;
  const service = createFileUploadService({
    ...h.dependencies,
    deleteObjectsBestEffort: async (keys) => {
      if (keys.includes(manifestKey)) {
        rollbackStarted.resolve();
        await releaseRollback.promise;
        await h.dependencies.deleteObjectsBestEffort(keys);
        rollbackFinished = true;
        return;
      }
      if (keys.includes(claimKey)) assert.equal(rollbackFinished, true);
      await h.dependencies.deleteObjectsBestEffort(keys);
    },
  });

  const completion = service.complete(owner, initiated.uploadId);
  await rollbackStarted.promise;
  assert.equal(h.objects.has(claimKey), true);
  releaseRollback.resolve();
  await assert.rejects(completion, /database unavailable/);
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

test("cleanup removes a session at exactly 24 hours and remains bounded", async () => {
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
    createdAt: "2026-07-26T12:00:00.000Z",
  };
  h.objects.set(
    uploadManifestKey(uploadId),
    new TextEncoder().encode(JSON.stringify(manifest)),
  );
  const listings = [];
  const service = createFileUploadService({
    ...h.dependencies,
    listObjectKeys: async (prefix, limit) => {
      listings.push({ prefix, limit });
      return {
        keys:
          prefix === "_upload-manifests/"
            ? [uploadManifestKey(uploadId)]
            : [],
        cursor: "next-page",
      };
    },
  });
  await service.cleanupExpired();
  assert.deepEqual(listings, [
    { prefix: "_upload-manifests/", limit: 50 },
    { prefix: "_upload-claims/", limit: 50 },
  ]);
  assert.equal(h.objects.has(uploadManifestKey(uploadId)), false);
});

test("expired sessions cannot accept chunks and are cleaned", async () => {
  const h = harness();
  const uploadId = "5a6cf3ea-1cee-4e33-9486-80e3f03db343";
  const expired = {
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
    new TextEncoder().encode(JSON.stringify(expired)),
  );
  await assert.rejects(
    () => h.service.storeChunk(owner, uploadId, 0, new Uint8Array([1])),
    /expired/i,
  );
  assert.equal(h.objects.has(uploadManifestKey(uploadId)), false);
});

test("concurrent completion claims a session and creates metadata once", async () => {
  const h = harness();
  const { initiated } = await initiateAndStore(h);
  const metadataStarted = deferred();
  const releaseMetadata = deferred();
  const service = createFileUploadService({
    ...h.dependencies,
    createMetadata: async (input) => {
      metadataStarted.resolve();
      await releaseMetadata.promise;
      return h.dependencies.createMetadata(input);
    },
  });
  const winner = service.complete(owner, initiated.uploadId);
  await metadataStarted.promise;
  const claimKey = uploadClaimKey(initiated.uploadId);
  assert.equal(h.objects.has(claimKey), true);

  await assert.rejects(
    () => service.complete(owner, initiated.uploadId),
    /already being completed/i,
  );
  assert.equal(h.objects.has(claimKey), true);

  releaseMetadata.resolve();
  await winner;
  assert.equal(h.objects.has(claimKey), false);
  assert.equal(h.events.filter((event) => event === "metadata").length, 1);
  assert.equal(h.claims.size, 0);
});
