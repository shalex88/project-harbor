import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  parseProjectArchiveManifest,
  sha256Hex,
} from "../lib/project-archive.ts";
import { encodeProjectArchive } from "../lib/project-archive-zip.ts";
import {
  createProjectTransferService,
  readRequestBytes,
} from "../lib/project-transfer.ts";

const root = new URL("../", import.meta.url);
const transferSource = await readFile(
  new URL("lib/project-transfer.ts", root),
  "utf8",
).catch(() => "");
const exportRoute = await readFile(
  new URL("app/api/projects/[projectId]/archive/route.ts", root),
  "utf8",
).catch(() => "");
const importRoute = await readFile(
  new URL("app/api/projects/import/route.ts", root),
  "utf8",
).catch(() => "");

async function importFixture() {
  const attachmentBytes = new TextEncoder().encode("hello");
  const receiptBytes = new TextEncoder().encode("%PDF");
  const manifest = parseProjectArchiveManifest({
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
    payments: [
      {
        id: "payment-1",
        itemId: "task-1",
        amountMinor: 100,
        paidOn: "2026-07-02",
        note: "Fee",
        creatorLabel: "Alex",
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    attachments: [
      {
        id: "attachment-1",
        itemId: "task-1",
        path: "attachments/attachment-1",
        filename: "plans.txt",
        contentType: "text/plain",
        sizeBytes: attachmentBytes.byteLength,
        sha256: await sha256Hex(attachmentBytes),
        pinned: false,
        position: 0,
        uploaderLabel: "Alex",
        createdAt: "2026-07-03T10:00:00.000Z",
      },
    ],
    receipts: [
      {
        id: "receipt-1",
        paymentId: "payment-1",
        path: "receipts/receipt-1",
        filename: "receipt.pdf",
        contentType: "application/pdf",
        sizeBytes: receiptBytes.byteLength,
        sha256: await sha256Hex(receiptBytes),
        uploaderLabel: "Alex",
        createdAt: "2026-07-03T11:00:00.000Z",
      },
    ],
  });
  return {
    manifest,
    payloads: new Map([
      ["attachments/attachment-1", attachmentBytes],
      ["receipts/receipt-1", receiptBytes],
    ]),
  };
}

function importPlan(manifest) {
  return {
    manifest,
    projectId: "new-project",
    ownerUserId: "user-1",
    collectionIds: new Map(),
    itemIds: new Map(),
    relationIds: new Map(),
    paymentIds: new Map(),
    relations: [],
    payloads: [
      {
        archivePath: "attachments/attachment-1",
        r2Key: "projects/new-project/file-1",
        fileObjectId: "file-1",
        itemFileId: "item-file-1",
        itemId: "task-new",
        paymentId: null,
      },
      {
        archivePath: "receipts/receipt-1",
        r2Key: "projects/new-project/file-2",
        fileObjectId: "file-2",
        itemFileId: null,
        itemId: null,
        paymentId: "payment-new",
      },
    ],
  };
}

function serviceDependencies(overrides = {}) {
  const calls = { puts: [], deletes: [], persists: 0 };
  const dependencies = {
    now: () => new Date("2026-07-22T12:00:00.000Z"),
    loadSource: async () => {
      throw new Error("not used");
    },
    readObjectBytes: async () => null,
    planImport: async (_identity, manifest) => importPlan(manifest),
    putObjectBytes: async (key, bytes, contentType) => {
      calls.puts.push({ key, bytes: bytes.slice(), contentType });
    },
    persistImport: async () => {
      calls.persists += 1;
      return "new-project";
    },
    deleteObjectsBestEffort: async (keys) => {
      calls.deletes.push([...keys]);
    },
    loadSnapshot: async () => ({ generatedAt: "snapshot" }),
    ...overrides,
  };
  return { calls, dependencies };
}

test("successful import uploads validated bytes before persisting", async () => {
  const fixture = await importFixture();
  const archive = encodeProjectArchive(fixture.manifest, fixture.payloads);
  const { calls, dependencies } = serviceDependencies();
  const service = createProjectTransferService(dependencies);

  const result = await service.importProjectArchive(
    { email: "alex@example.com", displayName: "Alex" },
    archive,
  );

  assert.equal(result.projectId, "new-project");
  assert.deepEqual(result.snapshot, { generatedAt: "snapshot" });
  assert.equal(calls.puts.length, 2);
  assert.equal(calls.puts[0].contentType, "text/plain");
  assert.equal(calls.puts[1].contentType, "application/pdf");
  assert.equal(calls.persists, 1);
  assert.deepEqual(calls.deletes, []);
});

test("upload failure cleans attempted keys and never persists", async () => {
  const fixture = await importFixture();
  const archive = encodeProjectArchive(fixture.manifest, fixture.payloads);
  let attempts = 0;
  const { calls, dependencies } = serviceDependencies({
    putObjectBytes: async (key, bytes, contentType) => {
      calls.puts.push({ key, bytes: bytes.slice(), contentType });
      attempts += 1;
      if (attempts === 2) throw new Error("R2 unavailable");
    },
  });

  await assert.rejects(
    () =>
      createProjectTransferService(dependencies).importProjectArchive(
        { email: "alex@example.com", displayName: "Alex" },
        archive,
      ),
    /store the imported files/i,
  );
  assert.equal(calls.persists, 0);
  assert.deepEqual(calls.deletes, [
    ["projects/new-project/file-1", "projects/new-project/file-2"],
  ]);
});

test("database failure cleans every uploaded object", async () => {
  const fixture = await importFixture();
  const archive = encodeProjectArchive(fixture.manifest, fixture.payloads);
  const { calls, dependencies } = serviceDependencies({
    persistImport: async () => {
      calls.persists += 1;
      throw new Error("D1 unavailable");
    },
  });

  await assert.rejects(
    () =>
      createProjectTransferService(dependencies).importProjectArchive(
        { email: "alex@example.com", displayName: "Alex" },
        archive,
      ),
    /create the imported project/i,
  );
  assert.equal(calls.persists, 1);
  assert.deepEqual(calls.deletes, [
    ["projects/new-project/file-1", "projects/new-project/file-2"],
  ]);
});

test("export loads every stored payload and produces a valid Harbor archive", async () => {
  const fixture = await importFixture();
  const source = {
    project: fixture.manifest.project,
    collections: fixture.manifest.collections,
    items: fixture.manifest.items,
    relations: fixture.manifest.relations,
    payments: fixture.manifest.payments,
    attachments: fixture.manifest.attachments.map(({ sha256, ...entry }) => {
      void sha256;
      return { ...entry, r2Key: "source/file-1" };
    }),
    receipts: fixture.manifest.receipts.map(({ sha256, ...entry }) => {
      void sha256;
      return { ...entry, r2Key: "source/file-2" };
    }),
  };
  const { dependencies } = serviceDependencies({
    loadSource: async () => source,
    readObjectBytes: async (key) =>
      key === "source/file-1"
        ? fixture.payloads.get("attachments/attachment-1")
        : fixture.payloads.get("receipts/receipt-1"),
  });
  const result = await createProjectTransferService(
    dependencies,
  ).exportProjectArchive(
    { email: "alex@example.com", displayName: "Alex" },
    "project-1",
  );

  assert.equal(result.filename, "House.harbor.zip");
  assert.ok(result.bytes.byteLength > 0);
  const { decodeProjectArchive } = await import(
    "../lib/project-archive-zip.ts"
  );
  const decoded = await decodeProjectArchive(result.bytes);
  assert.deepEqual(decoded.payloads, fixture.payloads);
  assert.equal(decoded.manifest.exportedAt, "2026-07-22T12:00:00.000Z");
  assert.deepEqual(decoded.manifest.payments, fixture.manifest.payments);
  assert.deepEqual(decoded.manifest.attachments, fixture.manifest.attachments);
  assert.deepEqual(decoded.manifest.receipts, fixture.manifest.receipts);
  assert.equal(decoded.manifest.attachments[0].pinned, false);
});

test("export reflects the source's current empty payment and file state", async () => {
  const fixture = await importFixture();
  const source = {
    project: fixture.manifest.project,
    collections: fixture.manifest.collections,
    items: fixture.manifest.items,
    relations: fixture.manifest.relations,
    payments: [],
    attachments: [],
    receipts: [],
  };
  const { dependencies } = serviceDependencies({
    loadSource: async () => source,
    readObjectBytes: async () => {
      throw new Error("an empty source must not read stored objects");
    },
  });
  const result = await createProjectTransferService(
    dependencies,
  ).exportProjectArchive(
    { email: "alex@example.com", displayName: "Alex" },
    "project-1",
  );

  const { decodeProjectArchive } = await import(
    "../lib/project-archive-zip.ts"
  );
  const decoded = await decodeProjectArchive(result.bytes);
  assert.deepEqual(decoded.manifest.payments, []);
  assert.deepEqual(decoded.manifest.attachments, []);
  assert.deepEqual(decoded.manifest.receipts, []);
  assert.deepEqual(decoded.payloads, new Map());
});

test("bounded request reading rejects actual bytes beyond the limit", async () => {
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array([1, 2, 3]));
      controller.enqueue(new Uint8Array([4, 5, 6]));
      controller.close();
    },
  });
  await assert.rejects(() => readRequestBytes(stream, 5), /archive is too large/i);
  assert.equal(
    (await readRequestBytes(new Blob([new Uint8Array([1, 2, 3])]).stream(), 5))
      .byteLength,
    3,
  );
});

test("authenticated routes enforce limits and download headers", () => {
  assert.match(exportRoute, /requireAppUser\(\)/);
  assert.match(exportRoute, /downloadHeaders/);
  assert.match(exportRoute, /application\/zip/);
  assert.match(importRoute, /requireAppUser\(\)/);
  assert.match(importRoute, /Content-Length/i);
  assert.match(importRoute, /MAX_ARCHIVE_BYTES/);
  assert.match(importRoute, /readRequestBytes\(request\.body/);
  assert.match(transferSource, /deleteObjectsBestEffort/);
  assert.ok(
    transferSource.indexOf("putObjectBytes") <
      transferSource.indexOf("persistImport(plan)"),
  );
});
