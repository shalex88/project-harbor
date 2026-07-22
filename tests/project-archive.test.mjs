import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ARCHIVE_ENTRIES,
  parseProjectArchiveManifest,
  projectArchiveFilename,
  sha256Hex,
  validateArchivePayloads,
} from "../lib/project-archive.ts";

const HELLO_SHA256 =
  "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824";

function validManifest() {
  return {
    format: "project-harbor-project",
    version: 1,
    exportedAt: "2026-07-22T12:00:00.000Z",
    project: {
      name: "בית חדש",
      description: "Coordinate the build.",
      currency: "ILS",
    },
    collections: [
      {
        id: "collection-1",
        name: "General",
        color: "cyan",
        position: 0,
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    items: [
      {
        id: "task-1",
        collectionId: "collection-1",
        type: "task",
        title: "Approve plans",
        description: "",
        status: "todo",
        dueDate: "2026-08-01",
        estimatedCostMinor: 12500,
        creatorLabel: "Alex",
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-04T10:00:00.000Z",
      },
    ],
    relations: [],
    payments: [
      {
        id: "payment-1",
        itemId: "task-1",
        amountMinor: 2500,
        paidOn: "2026-07-05",
        note: "Permit fee",
        creatorLabel: "Alex",
        createdAt: "2026-07-05T10:00:00.000Z",
        updatedAt: "2026-07-05T10:00:00.000Z",
      },
    ],
    attachments: [
      {
        id: "file-1",
        itemId: "task-1",
        path: "attachments/file-1",
        filename: "plans.txt",
        contentType: "text/plain",
        sizeBytes: 5,
        sha256: HELLO_SHA256,
        pinned: true,
        position: 0,
        uploaderLabel: "Alex",
        createdAt: "2026-07-06T10:00:00.000Z",
      },
    ],
    receipts: [],
  };
}

test("parses a complete version-1 archive manifest", () => {
  const manifest = parseProjectArchiveManifest(validManifest());
  assert.equal(manifest.format, "project-harbor-project");
  assert.equal(manifest.project.currency, "ILS");
  assert.equal(manifest.items[0].collectionId, "collection-1");
  assert.equal(manifest.attachments[0].path, "attachments/file-1");
});

test("rejects unknown fields and dangling references", () => {
  assert.throws(
    () =>
      parseProjectArchiveManifest({
        ...validManifest(),
        secret: true,
      }),
    /unsupported field: secret/i,
  );

  const value = validManifest();
  value.items[0].collectionId = "missing";
  assert.throws(
    () => parseProjectArchiveManifest(value),
    /unknown collection reference/i,
  );
});

test("rejects duplicate ids and unsafe payload paths", () => {
  const duplicate = validManifest();
  duplicate.collections.push({ ...duplicate.collections[0] });
  assert.throws(
    () => parseProjectArchiveManifest(duplicate),
    /duplicate collection id/i,
  );

  for (const path of [
    "attachments/../secret",
    "/attachments/file-1",
    "attachments\\file-1",
    "attachments//file-1",
  ]) {
    const unsafe = validManifest();
    unsafe.attachments[0].path = path;
    assert.throws(
      () => parseProjectArchiveManifest(unsafe),
      /unsafe archive path/i,
    );
  }
});

test("enforces task event and blocking relationship rules", () => {
  const badEvent = validManifest();
  badEvent.items[0] = {
    ...badEvent.items[0],
    type: "event",
    occurrenceDate: "2026-08-01",
  };
  assert.throws(
    () => parseProjectArchiveManifest(badEvent),
    /unsupported field: status/i,
  );

  const blockingEvent = validManifest();
  blockingEvent.items.push({
    id: "event-1",
    collectionId: "collection-1",
    type: "event",
    title: "Inspection",
    description: "",
    occurrenceDate: "2026-08-04",
    estimatedCostMinor: null,
    creatorLabel: "Alex",
    createdAt: "2026-07-03T10:00:00.000Z",
    updatedAt: "2026-07-04T10:00:00.000Z",
  });
  blockingEvent.relations.push({
    id: "relation-1",
    sourceItemId: "task-1",
    targetItemId: "event-1",
    type: "blocks",
    createdAt: "2026-07-07T10:00:00.000Z",
  });
  assert.throws(
    () => parseProjectArchiveManifest(blockingEvent),
    /blocking relationships require two tasks/i,
  );
});

test("rejects cyclic directed relations and noncanonical symmetric relations", () => {
  const cyclic = validManifest();
  cyclic.items.push({
    ...cyclic.items[0],
    id: "task-2",
    title: "Second task",
  });
  cyclic.relations.push(
    {
      id: "relation-1",
      sourceItemId: "task-1",
      targetItemId: "task-2",
      type: "blocks",
      createdAt: "2026-07-07T10:00:00.000Z",
    },
    {
      id: "relation-2",
      sourceItemId: "task-2",
      targetItemId: "task-1",
      type: "blocks",
      createdAt: "2026-07-07T11:00:00.000Z",
    },
  );
  assert.throws(
    () => parseProjectArchiveManifest(cyclic),
    /relationship would create a cycle/i,
  );

  const symmetric = validManifest();
  symmetric.items.push({
    ...symmetric.items[0],
    id: "task-2",
    title: "Second task",
  });
  symmetric.relations.push({
    id: "relation-1",
    sourceItemId: "task-2",
    targetItemId: "task-1",
    type: "related_to",
    createdAt: "2026-07-07T10:00:00.000Z",
  });
  assert.throws(
    () => parseProjectArchiveManifest(symmetric),
    /canonical endpoint order/i,
  );
});

test("validates payload bytes against declarations and checksums", async () => {
  const manifest = parseProjectArchiveManifest(validManifest());
  const payloads = new Map([
    ["attachments/file-1", new TextEncoder().encode("hello")],
  ]);
  await assert.doesNotReject(() => validateArchivePayloads(manifest, payloads));

  await assert.rejects(
    () => validateArchivePayloads(manifest, new Map()),
    /damaged or incomplete/i,
  );

  await assert.rejects(
    () =>
      validateArchivePayloads(
        manifest,
        new Map([...payloads, ["attachments/extra", new Uint8Array([1])]]),
      ),
    /unexpected archive entry/i,
  );

  await assert.rejects(
    () =>
      validateArchivePayloads(
        manifest,
        new Map([["attachments/file-1", new TextEncoder().encode("HELLO")]]),
      ),
    /integrity check/i,
  );
});

test("enforces the ZIP entry count at manifest validation time", () => {
  const value = validManifest();
  value.attachments = Array.from(
    { length: MAX_ARCHIVE_ENTRIES },
    (_, index) => ({
      ...value.attachments[0],
      id: `file-${index}`,
      path: `attachments/file-${index}`,
    }),
  );
  assert.throws(
    () => parseProjectArchiveManifest(value),
    /too many files/i,
  );
});

test("hashes bytes and builds a sanitized Harbor filename", async () => {
  assert.equal(
    await sha256Hex(new TextEncoder().encode("hello")),
    HELLO_SHA256,
  );
  assert.equal(
    projectArchiveFilename("  בניית / בית  "),
    "בניית-בית.harbor.zip",
  );
  assert.equal(projectArchiveFilename("///"), "project.harbor.zip");
});
