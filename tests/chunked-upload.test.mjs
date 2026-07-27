import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_UPLOAD_BYTES,
  UPLOAD_CHUNK_BYTES,
  assembleUploadChunks,
  expectedChunkCount,
  expectedChunkSize,
  parseUploadInitiation,
  parseUploadSessionManifest,
  readUploadChunk,
  uploadChunkKey,
  uploadManifestKey,
} from "../lib/chunked-upload.ts";

const manifest = {
  version: 1,
  uploadId: "5a6cf3ea-1cee-4e33-9486-80e3f03db343",
  identity: "account-user-1",
  projectId: "project-1",
  itemId: "item-1",
  paymentId: null,
  filename: "plans.pdf",
  contentType: "application/pdf",
  sizeBytes: UPLOAD_CHUNK_BYTES + 1,
  chunkCount: 2,
  createdAt: "2026-07-27T12:00:00.000Z",
};

test("rejects explicitly empty upload target identifiers", () => {
  for (const input of [
    {
      itemId: "",
      paymentId: "payment-1",
      filename: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 1,
    },
    {
      itemId: "item-1",
      paymentId: "",
      filename: "plans.pdf",
      contentType: "application/pdf",
      sizeBytes: 1,
    },
  ]) {
    assert.throws(
      () => parseUploadInitiation(input),
      /Upload details are invalid/,
    );
  }
});

test("calculates exact chunk counts and sizes", () => {
  assert.equal(MAX_UPLOAD_BYTES, 5 * 1024 * 1024);
  assert.equal(UPLOAD_CHUNK_BYTES, 512 * 1024);
  assert.equal(expectedChunkCount(1), 1);
  assert.equal(expectedChunkCount(512 * 1024), 1);
  assert.equal(expectedChunkCount(512 * 1024 + 1), 2);
  assert.equal(expectedChunkCount(5 * 1024 * 1024), 10);
  assert.equal(expectedChunkSize(512 * 1024 + 1, 0), 512 * 1024);
  assert.equal(expectedChunkSize(512 * 1024 + 1, 1), 1);
});

test("rejects a declared oversized chunk before reading its body", async () => {
  let bodyRead = false;
  const request = {
    headers: new Headers({
      "Content-Length": String(UPLOAD_CHUNK_BYTES + 1),
    }),
    get body() {
      bodyRead = true;
      throw new Error("body must not be accessed");
    },
  };

  await assert.rejects(
    () => readUploadChunk(request),
    /chunk size is invalid/i,
  );
  assert.equal(bodyRead, false);
});

test("rejects actual chunk bytes above 512 KiB without a length header", async () => {
  let cancelled = false;
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(UPLOAD_CHUNK_BYTES));
      controller.enqueue(new Uint8Array([1]));
    },
    cancel() {
      cancelled = true;
    },
  });
  const request = { headers: new Headers(), body };

  await assert.rejects(
    () => readUploadChunk(request),
    /chunk size is invalid/i,
  );
  assert.equal(cancelled, true);
});

test("rejects a chunk when declared and actual sizes differ", async () => {
  const request = new Request("http://localhost/api/files?stage=chunk", {
    method: "POST",
    headers: { "Content-Length": "2" },
    body: new Uint8Array([1, 2, 3]),
  });

  await assert.rejects(
    () => readUploadChunk(request),
    /chunk size is invalid/i,
  );
});

test("accepts a matching declared size for a smaller final chunk", async () => {
  const request = new Request("http://localhost/api/files?stage=chunk", {
    method: "POST",
    headers: { "Content-Length": "3" },
    body: new Uint8Array([7, 8, 9]),
  });

  assert.deepEqual(await readUploadChunk(request), new Uint8Array([7, 8, 9]));
});

test("parses a strict upload manifest", () => {
  assert.deepEqual(parseUploadSessionManifest(manifest), manifest);
  assert.throws(
    () => parseUploadSessionManifest({ ...manifest, uploadId: "guessable" }),
    /manifest/i,
  );
  assert.throws(
    () =>
      parseUploadSessionManifest({
        ...manifest,
        paymentId: "payment-1",
      }),
    /manifest/i,
  );
  assert.throws(
    () =>
      parseUploadSessionManifest({
        ...manifest,
        itemId: null,
        paymentId: null,
      }),
    /manifest/i,
  );
  assert.throws(
    () =>
      parseUploadSessionManifest({
        ...manifest,
        sizeBytes: MAX_UPLOAD_BYTES + 1,
      }),
    /manifest/i,
  );
  assert.throws(
    () => parseUploadSessionManifest({ ...manifest, chunkCount: 1 }),
    /manifest/i,
  );
  assert.throws(
    () => parseUploadSessionManifest({ ...manifest, identity: "" }),
    /manifest/i,
  );
});

test("generates isolated temporary object keys", () => {
  assert.equal(
    uploadManifestKey(manifest.uploadId),
    `_upload-manifests/${manifest.uploadId}.json`,
  );
  assert.equal(
    uploadChunkKey(manifest.uploadId, 7),
    `_upload-parts/${manifest.uploadId}/000007`,
  );
  assert.throws(() => uploadChunkKey(manifest.uploadId, -1), /chunk/i);
});

test("assembles validated chunks in index order", () => {
  const first = new Uint8Array(UPLOAD_CHUNK_BYTES).fill(7);
  const last = new Uint8Array([9]);
  const assembled = assembleUploadChunks(manifest, [first, last]);
  assert.equal(assembled.byteLength, UPLOAD_CHUNK_BYTES + 1);
  assert.equal(assembled[0], 7);
  assert.equal(assembled.at(-1), 9);
  assert.throws(() => assembleUploadChunks(manifest, [last, first]), /chunk/i);
  assert.throws(() => assembleUploadChunks(manifest, [first]), /chunk/i);
});
