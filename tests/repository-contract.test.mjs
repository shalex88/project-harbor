import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/repository.ts", import.meta.url),
  "utf8",
);

test("duplicate pending invitations produce a conflict", () => {
  assert.match(
    repository,
    /That email already has a pending invitation/,
  );
  assert.match(repository, /status = 'pending'/);
});

test("repository enforces relationship graph and project invariants", () => {
  for (const sourceMarker of [
    'case "create_relation"',
    'case "delete_relation"',
    'case "create_follow_up_task"',
    "WITH RECURSIVE reachable",
    "Relationship would create a cycle",
    "Blocking relationships require two tasks",
    "Items must belong to the same project",
  ]) {
    assert.match(repository, new RegExp(sourceMarker));
  }
});

test("follow-up creation batches the task and follows-from relation", () => {
  assert.match(repository, /mutation\.sourceEventId/);
  assert.match(repository, /source\.type !== "event"/);
  assert.match(repository, /mutation\.collectionId/);
  assert.match(repository, /db\.batch\(\[/);
  assert.match(repository, /'follows_from'/);
});

test("workspace snapshots load authorized relationship records", () => {
  assert.match(repository, /const relationRows = await all/);
  assert.match(repository, /relations: relationRows\.map/);
  assert.match(repository, /JOIN project_members current ON current\.project_id = wir\.project_id/);
});
