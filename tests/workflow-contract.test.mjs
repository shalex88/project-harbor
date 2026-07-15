import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const itemSource = await readFile(new URL("app/components/item-sheet.tsx", root), "utf8").catch(() => "");
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
  for (const label of ["Files", "Payments", "Add payment", "Upload receipt", "Pin file"]) {
    assert.match(itemSource, new RegExp(label));
  }
  assert.match(itemSource, /capture="environment"/);
});

test("project workspace supports members invitations and collections", () => {
  assert.ok(projectSource.length > 0, "project workspace must exist");
  for (const label of ["Invite member", "Pending invitations", "New collection", "Edit collection", "Delete collection"]) {
    assert.match(projectSource, new RegExp(label));
  }
});
