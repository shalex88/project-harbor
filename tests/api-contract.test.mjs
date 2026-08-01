import assert from "node:assert/strict";
import test from "node:test";

import { parseMutation } from "../lib/mutations.ts";
import {
  validateArchiveUpload,
  validateUpload,
} from "../lib/upload-policy.ts";

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

test("contact mutations normalize fixed fields and reject scope changes", () => {
  assert.deepEqual(
    parseMutation({
      action: "create_contact",
      projectId: "project-1",
      name: "  Dana Cohen  ",
      roleOrCompany: " Architect ",
      email: " dana@example.com ",
      phone: " +972 50 123 4567 ",
      notes: " Main planning contact ",
    }),
    {
      action: "create_contact",
      projectId: "project-1",
      name: "Dana Cohen",
      roleOrCompany: "Architect",
      email: "dana@example.com",
      phone: "+972 50 123 4567",
      notes: "Main planning contact",
    },
  );

  assert.deepEqual(
    parseMutation({
      action: "update_contact",
      contactId: "contact-1",
      name: "Dana Cohen",
    }),
    {
      action: "update_contact",
      contactId: "contact-1",
      name: "Dana Cohen",
      roleOrCompany: "",
      email: "",
      phone: "",
      notes: "",
    },
  );

  assert.deepEqual(
    parseMutation({ action: "delete_contact", contactId: "contact-1" }),
    { action: "delete_contact", contactId: "contact-1" },
  );

  assert.throws(
    () =>
      parseMutation({
        action: "create_contact",
        projectId: "project-1",
        name: "   ",
      }),
    /Contact name is required/,
  );
  assert.throws(
    () =>
      parseMutation({
        action: "create_contact",
        name: "Dana Cohen",
      }),
    /Project is required/,
  );
  assert.throws(
    () =>
      parseMutation({
        action: "update_contact",
        contactId: "contact-1",
        projectId: "project-2",
        name: "Dana Cohen",
      }),
    /unsupported field/i,
  );
  assert.throws(
    () =>
      parseMutation({
        action: "update_contact",
        contactId: "contact-1",
        name: "Dana Cohen",
        notes: "x".repeat(2_001),
      }),
    /Notes must be 2000 characters or less/,
  );
  assert.throws(
    () =>
      parseMutation({
        action: "delete_contact",
        contactId: "contact-1",
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

test("item mutations strictly parse structured contact links and mentions", () => {
  const contactFields = {
    manualContactIds: ["contact-dana"],
    contactMentions: [
      {
        contactId: "contact-dana",
        field: "title",
        startOffset: 5,
        endOffset: 10,
      },
    ],
  };

  assert.deepEqual(
    parseMutation({
      action: "create_item",
      collectionId: "collection-1",
      type: "task",
      title: "Call @Dana",
      description: "",
      status: "todo",
      dueDate: null,
      estimatedCostMinor: null,
      ...contactFields,
    }),
    {
      action: "create_item",
      collectionId: "collection-1",
      type: "task",
      title: "Call @Dana",
      description: "",
      status: "todo",
      dueDate: null,
      estimatedCostMinor: null,
      ...contactFields,
    },
  );

  assert.deepEqual(
    parseMutation({
      action: "create_item",
      collectionId: "collection-1",
      type: "event",
      title: "פגישה",
      occurrenceDate: "2026-08-02",
    }),
    {
      action: "create_item",
      collectionId: "collection-1",
      type: "event",
      title: "פגישה",
      description: "",
      occurrenceDate: "2026-08-02",
      estimatedCostMinor: undefined,
      manualContactIds: [],
      contactMentions: [],
    },
  );

  assert.deepEqual(
    parseMutation({
      action: "update_item",
      itemId: "task-1",
      type: "task",
      title: "Call @Dana",
      status: "todo",
      ...contactFields,
    }).contactMentions,
    contactFields.contactMentions,
  );

  assert.deepEqual(
    parseMutation({
      action: "create_follow_up_task",
      sourceEventId: "event-1",
      collectionId: "collection-1",
      title: "Call @Dana",
      status: "todo",
      ...contactFields,
    }).manualContactIds,
    contactFields.manualContactIds,
  );

  for (const [field, value, message] of [
    ["manualContactIds", "contact-dana", /must be an array/i],
    ["contactMentions", {}, /must be an array/i],
    ["manualContactIds", ["contact-dana", "contact-dana"], /duplicates/i],
  ]) {
    assert.throws(
      () =>
        parseMutation({
          action: "create_item",
          collectionId: "collection-1",
          type: "task",
          title: "Call @Dana",
          status: "todo",
          [field]: value,
        }),
      message,
    );
  }

  for (const mention of [
    { contactId: "contact-dana", field: "notes", startOffset: 5, endOffset: 10 },
    { contactId: "contact-dana", field: "title", startOffset: -1, endOffset: 10 },
    { contactId: "contact-dana", field: "title", startOffset: 5.5, endOffset: 10 },
    { contactId: "contact-dana", field: "title", startOffset: 5, endOffset: 5 },
    {
      contactId: "contact-dana",
      field: "title",
      startOffset: 5,
      endOffset: 10,
      label: "Dana",
    },
  ]) {
    assert.throws(() =>
      parseMutation({
        action: "create_item",
        collectionId: "collection-1",
        type: "task",
        title: "Call @Dana",
        status: "todo",
        contactMentions: [mention],
      }),
    );
  }
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
      manualContactIds: [],
      contactMentions: [],
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
        { name: ".JS", type: "application/octet-stream", size: 12 },
        "item",
      ),
    /unsupported/i,
  );
  assert.throws(
    () =>
      validateUpload(
        { name: "run.exe.", type: "application/octet-stream", size: 12 },
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
    /5 MB/,
  );
});

test("receipt policy accepts images and PDFs", () => {
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

test("all uploads use one 5 MiB maximum", () => {
  const maximum = 5 * 1024 * 1024;
  for (const [kind, type] of [
    ["item", "application/pdf"],
    ["receipt", "application/pdf"],
  ]) {
    assert.equal(
      validateUpload({ name: "document.pdf", type, size: maximum }, kind)
        .sizeBytes,
      maximum,
    );
    assert.throws(
      () =>
        validateUpload(
          { name: "document.pdf", type, size: maximum + 1 },
          kind,
        ),
      /5 MB/,
    );
  }
});

test("project archives preserve their existing attachment and receipt limits", () => {
  assert.equal(
    validateArchiveUpload(
      {
        name: "attachment.pdf",
        type: "application/pdf",
        size: 25 * 1024 * 1024,
      },
      "item",
    ).sizeBytes,
    25 * 1024 * 1024,
  );
  assert.equal(
    validateArchiveUpload(
      {
        name: "receipt.pdf",
        type: "application/pdf",
        size: 10 * 1024 * 1024,
      },
      "receipt",
    ).sizeBytes,
    10 * 1024 * 1024,
  );
});
