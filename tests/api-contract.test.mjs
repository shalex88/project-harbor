import assert from "node:assert/strict";
import test from "node:test";

import { parseMutation } from "../lib/mutations.ts";
import { validateUpload } from "../lib/upload-policy.ts";

test("workspace mutation parser rejects unknown actions", () => {
  assert.throws(
    () => parseMutation({ action: "set_priority", itemId: "task-1" }),
    /unknown action/,
  );
});

test("task mutations reject removed priority and assignee fields", () => {
  assert.throws(
    () =>
      parseMutation({
        action: "create_item",
        collectionId: "collection-1",
        type: "task",
        title: "Prepare release",
        status: "todo",
        priority: "high",
      }),
    /unsupported field/i,
  );
  assert.throws(
    () =>
      parseMutation({
        action: "create_item",
        collectionId: "collection-1",
        type: "task",
        title: "Prepare release",
        status: "todo",
        assigneeId: "user-1",
      }),
    /unsupported field/i,
  );
});


test("project deletion accepts only a project id", () => {
  assert.deepEqual(parseMutation({ action: "delete_project", projectId: "project-1" }), {
    action: "delete_project",
    projectId: "project-1",
  });
  assert.throws(
    () =>
      parseMutation({
        action: "delete_project",
        projectId: "project-1",
        name: "Unexpected",
      }),
    /unsupported field/i,
  );
});

test("events reject task workflow fields", () => {
  assert.throws(
    () =>
      parseMutation({
        action: "create_item",
        collectionId: "collection-1",
        type: "event",
        title: "Beta handoff",
        occurrenceDate: "2026-07-18",
        status: "todo",
      }),
    /unsupported field/i,
  );
});

test("relationship mutations accept fixed types and canonicalize symmetric links", () => {
  assert.deepEqual(
    parseMutation({
      action: "create_relation",
      sourceItemId: "item-z",
      targetItemId: "item-a",
      relationType: "related_to",
    }),
    {
      action: "create_relation",
      sourceItemId: "item-a",
      targetItemId: "item-z",
      relationType: "related_to",
    },
  );
  assert.deepEqual(
    parseMutation({ action: "delete_relation", relationId: "relation-1" }),
    { action: "delete_relation", relationId: "relation-1" },
  );
  assert.throws(
    () =>
      parseMutation({
        action: "create_relation",
        sourceItemId: "item-1",
        targetItemId: "item-2",
        relationType: "duplicates",
      }),
    /invalid relationship type/i,
  );
  assert.throws(
    () =>
      parseMutation({
        action: "create_relation",
        sourceItemId: "item-1",
        targetItemId: "item-1",
        relationType: "related_to",
      }),
    /cannot relate an item to itself/i,
  );
});

test("follow-up task mutations use ordinary task fields and a source event", () => {
  assert.deepEqual(
    parseMutation({
      action: "create_follow_up_task",
      sourceEventId: "event-1",
      collectionId: "collection-1",
      title: "Pay the Ministry of Housing voucher",
      description: "",
      status: "todo",
      dueDate: null,
      estimatedCostMinor: null,
    }),
    {
      action: "create_follow_up_task",
      sourceEventId: "event-1",
      collectionId: "collection-1",
      title: "Pay the Ministry of Housing voucher",
      description: "",
      status: "todo",
      dueDate: null,
      estimatedCostMinor: null,
    },
  );
  assert.throws(
    () =>
      parseMutation({
        action: "create_follow_up_task",
        sourceEventId: "event-1",
        collectionId: "collection-1",
        title: "Pay voucher",
        status: "todo",
        copiedEventDate: "2026-07-19",
      }),
    /unsupported field/i,
  );
});

test("upload policy rejects executables and oversized item files", () => {
  assert.throws(
    () =>
      validateUpload(
        { name: "run.exe", type: "application/x-msdownload", size: 12 },
        "item",
      ),
    /unsupported/i,
  );
  assert.throws(
    () =>
      validateUpload(
        {
          name: "large.pdf",
          type: "application/pdf",
          size: 25 * 1024 * 1024 + 1,
        },
        "item",
      ),
    /25 MB/,
  );
});

test("receipt policy accepts images and PDFs up to 10 MB", () => {
  assert.deepEqual(
    validateUpload(
      { name: "receipt.pdf", type: "application/pdf", size: 124_000 },
      "receipt",
    ),
    {
      filename: "receipt.pdf",
      contentType: "application/pdf",
      sizeBytes: 124_000,
    },
  );
  assert.throws(
    () =>
      validateUpload(
        { name: "receipt.zip", type: "application/zip", size: 1_000 },
        "receipt",
      ),
    /image or PDF/,
  );
});
