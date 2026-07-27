import assert from "node:assert/strict";
import test from "node:test";

import { createFileRenameService } from "../lib/file-rename-service.ts";

const identity = { email: "member@example.com", displayName: "Member" };

function harness({
  role = "member",
  paymentId = null,
  paymentCreatedBy = "member",
} = {}) {
  const stored = {
    id: "file-1",
    filename: "plans.PDF",
    r2Key: "projects/project-1/file-1",
    contentType: "application/pdf",
    sizeBytes: 42,
  };
  const dependencies = {
    prepare: async () => {},
    getUser: async () => ({
      id: "member",
      email: identity.email,
      displayName: identity.displayName,
    }),
    getFileContext: async () => ({
      projectId: "project-1",
      filename: stored.filename,
      paymentId,
    }),
    requireProjectAccess: async () => ({
      projectId: "project-1",
      userId: "member",
      role,
    }),
    getPaymentContext: async () => ({
      projectId: "project-1",
      createdBy: paymentCreatedBy,
    }),
    updateFilename: async (_fileId, filename) => {
      stored.filename = filename;
    },
    loadSnapshot: async () => ({
      file: { ...stored },
    }),
  };
  return {
    stored,
    service: createFileRenameService(dependencies),
  };
}

test("a project member renames attachment metadata without changing storage", async () => {
  const { service, stored } = harness();
  const before = { ...stored };

  const snapshot = await service.rename(identity, "file-1", " Final plans ");

  assert.equal(snapshot.file.filename, "Final plans.PDF");
  assert.equal(stored.r2Key, before.r2Key);
  assert.equal(stored.contentType, before.contentType);
  assert.equal(stored.sizeBytes, before.sizeBytes);
});

test("a member cannot rename another member's receipt", async () => {
  const { service, stored } = harness({
    paymentId: "payment-1",
    paymentCreatedBy: "someone-else",
  });

  await assert.rejects(
    () => service.rename(identity, "file-1", "Forbidden"),
    /cannot rename this receipt/i,
  );
  assert.equal(stored.filename, "plans.PDF");
});

test("the payment creator and project owner can rename a receipt", async () => {
  const creator = harness({
    paymentId: "payment-1",
    paymentCreatedBy: "member",
  });
  const owner = harness({
    role: "owner",
    paymentId: "payment-1",
    paymentCreatedBy: "someone-else",
  });

  assert.equal(
    (await creator.service.rename(identity, "file-1", "Creator copy")).file
      .filename,
    "Creator copy.PDF",
  );
  assert.equal(
    (await owner.service.rename(identity, "file-1", "Owner copy")).file
      .filename,
    "Owner copy.PDF",
  );
});
