import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/storage.ts", import.meta.url),
  "utf8",
);

test("storage exposes bounded temporary-object listing", () => {
  assert.match(source, /export async function listObjectKeys/);
  assert.match(source, /bucket\(\)\.list\(\{\s*prefix,\s*limit,\s*\.\.\.\(cursor/);
  assert.match(source, /objects\.map\(\(object\) => object\.key\)/);
  assert.match(source, /truncated/);
  assert.match(source, /cursor/);
});

test("upload cleanup derives manifest and chunk keys from validated metadata", () => {
  assert.match(source, /export async function deleteUploadObjectsBestEffort/);
  assert.match(source, /parseUploadSessionManifest\(input\)/);
  assert.match(source, /uploadManifestKey\(manifest\.uploadId\)/);
  assert.match(source, /uploadChunkKey\(manifest\.uploadId,\s*index\)/);
  assert.match(source, /deleteObjectsBestEffort\(keys\)/);
});
