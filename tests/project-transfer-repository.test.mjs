import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { parseProjectArchiveManifest } from "../lib/project-archive.ts";
import { createImportIdPlan } from "../lib/project-transfer-repository.ts";

const source = await readFile(
  new URL("../lib/project-transfer-repository.ts", import.meta.url),
  "utf8",
).catch(() => "");

function manifestFixture() {
  return parseProjectArchiveManifest({
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
        id: "task-z",
        collectionId: "collection-1",
        type: "task",
        title: "First",
        description: "",
        status: "todo",
        dueDate: null,
        estimatedCostMinor: null,
        creatorLabel: "Original creator",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
      {
        id: "task-a",
        collectionId: "collection-1",
        type: "task",
        title: "Second",
        description: "",
        status: "done",
        dueDate: "2026-07-10",
        estimatedCostMinor: 1000,
        creatorLabel: null,
        createdAt: "2026-07-02T10:00:00.000Z",
        updatedAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    relations: [
      {
        id: "relation-1",
        sourceItemId: "task-a",
        targetItemId: "task-z",
        type: "related_to",
        createdAt: "2026-07-03T10:00:00.000Z",
      },
    ],
    payments: [
      {
        id: "payment-1",
        itemId: "task-z",
        amountMinor: 500,
        paidOn: "2026-07-04",
        note: "Fee",
        creatorLabel: "Original payer",
        createdAt: "2026-07-04T10:00:00.000Z",
        updatedAt: "2026-07-04T10:00:00.000Z",
      },
    ],
    attachments: [
      {
        id: "attachment-1",
        itemId: "task-z",
        path: "attachments/attachment-1",
        filename: "plans.txt",
        contentType: "text/plain",
        sizeBytes: 5,
        sha256:
          "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
        pinned: true,
        position: 0,
        uploaderLabel: "Original uploader",
        createdAt: "2026-07-05T10:00:00.000Z",
      },
    ],
    receipts: [
      {
        id: "receipt-1",
        paymentId: "payment-1",
        path: "receipts/receipt-1",
        filename: "receipt.pdf",
        contentType: "application/pdf",
        sizeBytes: 4,
        sha256:
          "1054f4d55a4f13a9a3313e1f01792851966b7439c0d32e3197a12c3e66c5f0f7",
        uploaderLabel: "Original uploader",
        createdAt: "2026-07-05T11:00:00.000Z",
      },
    ],
  });
}

test("archive export queries authorize first and remain project scoped", () => {
  assert.ok(source.length > 0, "project transfer repository must exist");
  assert.match(source, /getUserByIdentity\(identity\)/);
  assert.match(source, /requireProjectAccess\(user\.id, projectId\)/);
  assert.ok(
    source.indexOf("requireProjectAccess(user.id, projectId)") <
      source.indexOf("SELECT p.id,p.name,p.description,p.currency"),
  );
  assert.match(source, /WHERE p\.id = \?/);
  assert.match(source, /wi\.project_id = \?/);
  assert.match(source, /fo\.project_id = \?/);
  assert.doesNotMatch(source, /project_invitations/);
  assert.doesNotMatch(source, /\bemail\b/i);
});

test("fresh import plans remap every entity and payload reference", () => {
  const manifest = manifestFixture();
  const plan = createImportIdPlan(manifest, "importer-user");

  assert.equal(plan.ownerUserId, "importer-user");
  assert.notEqual(plan.projectId, manifest.project.name);
  assert.equal(plan.collectionIds.size, 1);
  assert.equal(plan.itemIds.size, 2);
  assert.equal(plan.relationIds.size, 1);
  assert.equal(plan.paymentIds.size, 1);
  assert.equal(plan.payloads.length, 2);

  for (const item of manifest.items) {
    assert.ok(plan.itemIds.has(item.id));
    assert.notEqual(plan.itemIds.get(item.id), item.id);
  }
  const attachment = plan.payloads.find(
    (payload) => payload.archivePath === "attachments/attachment-1",
  );
  assert.ok(attachment);
  assert.equal(attachment.itemId, plan.itemIds.get("task-z"));
  assert.match(
    attachment.r2Key,
    new RegExp(`^projects/${plan.projectId}/`),
  );
  assert.ok(attachment.itemFileId);

  const receipt = plan.payloads.find(
    (payload) => payload.archivePath === "receipts/receipt-1",
  );
  assert.ok(receipt);
  assert.equal(receipt.paymentId, plan.paymentIds.get("payment-1"));
  assert.equal(receipt.itemFileId, null);
});

test("fresh related-to endpoints are recanonicalized after id remapping", () => {
  const plan = createImportIdPlan(manifestFixture(), "importer-user");
  const [relation] = plan.relations;
  assert.equal(relation.type, "related_to");
  assert.ok(relation.sourceItemId < relation.targetItemId);
  assert.deepEqual(
    new Set([relation.sourceItemId, relation.targetItemId]),
    new Set([plan.itemIds.get("task-a"), plan.itemIds.get("task-z")]),
  );
});

test("reimporting the same manifest produces independent ids and storage keys", () => {
  const manifest = manifestFixture();
  const first = createImportIdPlan(manifest, "importer-user");
  const second = createImportIdPlan(manifest, "importer-user");
  assert.notEqual(first.projectId, second.projectId);
  assert.notDeepEqual([...first.itemIds.values()], [...second.itemIds.values()]);
  assert.notDeepEqual(
    first.payloads.map((payload) => payload.r2Key),
    second.payloads.map((payload) => payload.r2Key),
  );
});

test("import persistence maps attribution to labels and writes one D1 batch", () => {
  assert.match(source, /imported_creator_label/);
  assert.match(source, /imported_uploader_label/);
  assert.match(source, /created_by.*ownerUserId/s);
  assert.match(source, /uploaded_by.*ownerUserId/s);
  assert.match(source, /db\.batch\(statements\)/);
});
