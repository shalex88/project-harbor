import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const itemSource = await readFile(new URL("app/components/item-sheet.tsx", root), "utf8").catch(() => "");
const receiptActionsSource = await readFile(new URL("lib/payment-receipt-actions.ts", root), "utf8").catch(() => "");
const relationSource = await readFile(new URL("app/components/item-relations.tsx", root), "utf8").catch(() => "");
const followUpMenuSource = await readFile(
  new URL("app/components/follow-up-menu.tsx", root),
  "utf8",
).catch(() => "");
const itemWorkflowSource = `${itemSource}\n${relationSource}`;
const harborSource = await readFile(new URL("app/components/harbor-app.tsx", root), "utf8").catch(() => "");
const projectSource = await readFile(new URL("app/components/project-workspace.tsx", root), "utf8").catch(() => "");

test("task form exposes only approved workflow fields", () => {
  assert.ok(itemSource.length > 0, "item sheet must exist");
  for (const field of ["Title", "Description", "Status", "Due date", "Estimated cost"]) {
    assert.match(itemSource, new RegExp(field));
  }
  assert.doesNotMatch(itemSource, /priority|assignee/i);
});

test("event form has occurrence date and no task workflow state", () => {
  assert.match(itemSource, /Occurrence date/);
  assert.match(itemSource, /type === "task"/);
  assert.match(itemSource, /type === "event"/);
});

test("item sheet supports files payments receipts and mobile capture", () => {
  const receiptSource = `${itemSource}\n${receiptActionsSource}`;
  for (const label of ["Files", "Payments", "Add payment", "Upload receipt", "Remove file"]) {
    assert.match(receiptSource, new RegExp(label));
  }
  assert.match(itemSource, /capture="environment"/);
});

test("project workspace supports members invitations and collections", () => {
  assert.ok(projectSource.length > 0, "project workspace must exist");
  for (const label of ["Invite member", "Pending invitations", "New collection", "Edit collection", "Delete collection"]) {
    assert.match(projectSource, new RegExp(label));
  }
});

test("project collection work-item rows show relation metadata", () => {
  assert.match(projectSource, /@\/lib\/relation-metadata/);
  assert.match(projectSource, /tasks\.map[\s\S]*?workItemMetadata/);
  assert.match(projectSource, /events\.map[\s\S]*?workItemMetadata/);
});

test("project task rows use one shared status indicator", () => {
  assert.match(projectSource, /import \{ TaskStatusChip \} from "\.\/task-status-chip"/);
  assert.doesNotMatch(projectSource, /task-check/);
  assert.match(projectSource, /tasks\.map[\s\S]*?<TaskStatusChip status=\{task\.status\}/);
  assert.doesNotMatch(projectSource, /task\.status\.replace/);
});

test("item sheets expose relation browsing and management", () => {
  for (const label of [
    "Relations",
    "Follow-up items",
    "Follows from",
    "Blocks",
    "Blocked by",
    "Related items",
    "Add relationship",
    "Remove relationship",
  ]) {
    assert.match(itemWorkflowSource, new RegExp(label));
  }
  assert.match(itemWorkflowSource, /action: "create_relation"/);
  assert.match(itemWorkflowSource, /action: "delete_relation"/);
  assert.match(itemWorkflowSource, /onOpenItem/);
});

test("tasks and events create task or event follow-ups from one menu", () => {
  assert.match(followUpMenuSource, /Create follow-up/);
  assert.match(followUpMenuSource, />Task</);
  assert.match(followUpMenuSource, />Event</);
  assert.match(followUpMenuSource, /aria-haspopup="menu"/);
  assert.match(followUpMenuSource, /role="menu"/);
  assert.match(followUpMenuSource, /role="menuitem"/);
  assert.match(
    followUpMenuSource,
    /onKeyDownCapture=\{handleMenuKeyDown\}/,
  );
  assert.match(itemSource, /sourceItemId/);
  assert.match(itemSource, /type: "task" \| "event"/);
  assert.match(itemSource, /action: "create_follow_up_item"/);
  assert.match(itemSource, /Follows from/);
  assert.match(itemSource, /kind: "follow-up"/);
  assert.match(harborSource, /result\.createdItemId/);
  assert.match(harborSource, /followUpCreatedItemMode\(/);
  assert.doesNotMatch(
    itemSource,
    /item\.type === "event" \? \([\s\S]{0,500}<FollowUpMenu/,
  );
  assert.doesNotMatch(itemSource, /convert/i);
});
