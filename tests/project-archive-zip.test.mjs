import assert from "node:assert/strict";
import test from "node:test";

import { strToU8, zipSync } from "fflate";
import {
  MAX_ARCHIVE_BYTES,
  sha256Hex,
} from "../lib/project-archive.ts";
import {
  decodeProjectArchive,
  encodeProjectArchive,
} from "../lib/project-archive-zip.ts";

async function validArchive() {
  const file = strToU8("hello");
  return {
    manifest: {
      format: "project-harbor-project",
      version: 1,
      exportedAt: "2026-07-22T12:00:00.000Z",
      project: { name: "House", description: "", currency: "ILS" },
      collections: [
        {
          id: "collection-1",
          name: "General",
          color: "cyan",
          position: 0,
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      items: [
        {
          id: "task-1",
          collectionId: "collection-1",
          type: "task",
          title: "Plans",
          description: "",
          status: "todo",
          dueDate: null,
          estimatedCostMinor: null,
          creatorLabel: "Alex",
          createdAt: "2026-07-01T10:00:00.000Z",
          updatedAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      relations: [],
      payments: [],
      attachments: [
        {
          id: "file-1",
          itemId: "task-1",
          path: "attachments/file-1",
          filename: "plans.txt",
          contentType: "text/plain",
          sizeBytes: file.byteLength,
          sha256: await sha256Hex(file),
          pinned: false,
          position: 0,
          uploaderLabel: "Alex",
          createdAt: "2026-07-01T10:00:00.000Z",
        },
      ],
      receipts: [],
    },
    payloads: new Map([["attachments/file-1", file]]),
  };
}

function rawZip(entries) {
  return zipSync(
    Object.fromEntries(
      Object.entries(entries).map(([path, value]) => [
        path,
        typeof value === "string" ? strToU8(value) : value,
      ]),
    ),
  );
}

function patchHeaderFields(bytes, patch) {
  const result = bytes.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  for (let offset = 0; offset + 30 <= result.length; offset += 1) {
    const signature = view.getUint32(offset, true);
    if (signature === 0x04034b50 || signature === 0x02014b50) {
      patch(view, offset, signature);
    }
  }
  return result;
}

function replaceAscii(bytes, from, to) {
  assert.equal(from.length, to.length);
  const result = bytes.slice();
  const fromBytes = strToU8(from);
  const toBytes = strToU8(to);
  for (let offset = 0; offset <= result.length - fromBytes.length; offset += 1) {
    if (fromBytes.every((value, index) => result[offset + index] === value)) {
      result.set(toBytes, offset);
    }
  }
  return result;
}

test("round trips a manifest and attachment bytes", async () => {
  const input = await validArchive();
  const bytes = encodeProjectArchive(input.manifest, input.payloads);
  const decoded = await decodeProjectArchive(bytes);

  assert.deepEqual(decoded.manifest, input.manifest);
  assert.deepEqual(
    decoded.payloads.get("attachments/file-1"),
    input.payloads.get("attachments/file-1"),
  );
});

test("produces deterministic archives regardless of payload insertion order", async () => {
  const input = await validArchive();
  const secondPath = "attachments/file-2";
  const secondBytes = strToU8("world");
  input.manifest.attachments.push({
    ...input.manifest.attachments[0],
    id: "file-2",
    path: secondPath,
    filename: "more.txt",
    sha256: await sha256Hex(secondBytes),
  });
  const forward = new Map([
    ...input.payloads,
    [secondPath, secondBytes],
  ]);
  const reverse = new Map([...forward].reverse());
  assert.deepEqual(
    encodeProjectArchive(input.manifest, forward),
    encodeProjectArchive(input.manifest, reverse),
  );
});

test("rejects oversized, missing-manifest, unexpected, and unsafe archives", async () => {
  await assert.rejects(
    () => decodeProjectArchive(new Uint8Array(MAX_ARCHIVE_BYTES + 1)),
    /archive is too large/i,
  );
  await assert.rejects(
    () => decodeProjectArchive(rawZip({ "attachments/file-1": "hello" })),
    /damaged or incomplete/i,
  );
  await assert.rejects(
    () =>
      decodeProjectArchive(
        rawZip({ "manifest.json": "{}", "other/data": "hello" }),
      ),
    /unexpected archive entry/i,
  );
  await assert.rejects(
    () =>
      decodeProjectArchive(
        rawZip({ "manifest.json": "{}", "../secret": "hello" }),
      ),
    /unsafe archive path/i,
  );
});

test("rejects directory, encrypted, and unsupported-compression entries", async () => {
  await assert.rejects(
    () =>
      decodeProjectArchive(
        rawZip({ "manifest.json": "{}", "attachments/": new Uint8Array() }),
      ),
    /directory entries/i,
  );

  const plain = rawZip({ "manifest.json": "{}" });
  const encrypted = patchHeaderFields(plain, (view, offset, signature) => {
    const flagsOffset = offset + (signature === 0x04034b50 ? 6 : 8);
    view.setUint16(flagsOffset, view.getUint16(flagsOffset, true) | 1, true);
  });
  await assert.rejects(
    () => decodeProjectArchive(encrypted),
    /encrypted entries/i,
  );

  const unsupported = patchHeaderFields(plain, (view, offset, signature) => {
    const methodOffset = offset + (signature === 0x04034b50 ? 8 : 10);
    view.setUint16(methodOffset, 99, true);
  });
  await assert.rejects(
    () => decodeProjectArchive(unsupported),
    /compression method/i,
  );
});

test("rejects duplicate normalized entry paths before decompression", async () => {
  const bytes = rawZip({
    "manifest.json": "{}",
    "attachments/a": "one",
    "attachments/b": "two",
  });
  const duplicate = replaceAscii(bytes, "attachments/a", "attachments/b");
  await assert.rejects(
    () => decodeProjectArchive(duplicate),
    /duplicate archive path/i,
  );
});
