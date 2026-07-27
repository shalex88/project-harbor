import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/repository.ts", import.meta.url),
  "utf8",
);
const workspaceRoute = await readFile(
  new URL("../app/api/workspace/route.ts", import.meta.url),
  "utf8",
);
const fileRoute = await readFile(
  new URL("../app/api/files/route.ts", import.meta.url),
  "utf8",
);
const storage = await readFile(
  new URL("../lib/storage.ts", import.meta.url),
  "utf8",
);
const fileUploadService = await readFile(
  new URL("../lib/file-upload-service.ts", import.meta.url),
  "utf8",
);

test("destructive workspace mutations collect and remove attached objects", () => {
  assert.match(repository, /listMutationFileKeys/);
  assert.match(repository, /DELETE FROM file_objects WHERE id IN/);
  assert.match(repository, /delete_project/);
  assert.match(repository, /projectFileKeys/);
  assert.match(workspaceRoute, /deleteObjectsBestEffort/);
  assert.match(storage, /Promise\.allSettled/);
  assert.match(storage, /attempt < 2/);
});

test("replacing a receipt removes the previous metadata and stored object", () => {
  assert.match(repository, /replacedR2Key/);
  assert.match(repository, /DELETE FROM file_objects WHERE id=\?/);
  assert.match(fileUploadService, /replacedR2Key/);
  assert.match(
    fileUploadService,
    /deleteObjectsBestEffort\(\[replacedR2Key\]\)/,
  );
});

test("file uploads use explicit chunk stages while preserving other file methods", () => {
  assert.match(fileRoute, /stage === "init"/);
  assert.match(fileRoute, /stage === "chunk"/);
  assert.match(fileRoute, /stage === "complete"/);
  assert.match(fileRoute, /request\.arrayBuffer\(\)/);
  assert.doesNotMatch(fileRoute, /request\.formData\(\)/);
  assert.match(fileRoute, /searchParams\.get\("uploadId"\)/);
  assert.match(fileRoute, /fileUploadService\.cancel/);
  assert.match(fileRoute, /fileUploadService\.storeChunk/);
  assert.match(fileRoute, /fileUploadService\.complete/);
  assert.match(fileRoute, /return errorResponse\(error\)/);
});
