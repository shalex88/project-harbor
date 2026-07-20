import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/repository.ts", import.meta.url),
  "utf8",
);
const relationPersistence = await readFile(
  new URL("../lib/relation-persistence.ts", import.meta.url),
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
    "Relationship would create a cycle",
    "Blocking relationships require two tasks",
    "Items must belong to the same project",
  ]) {
    assert.match(repository, new RegExp(sourceMarker));
  }
  assert.match(relationPersistence, /WITH RECURSIVE/);
  assert.match(relationPersistence, /reachable\(item_id\)/);
});

test("relation endpoints are authorized before project details are compared", () => {
  const relationCase = repository.slice(
    repository.indexOf('case "create_relation"'),
    repository.indexOf('case "delete_relation"'),
  );
  assert.match(relationCase, /authorizedRelationItem\(user\.id/);
  assert.ok(
    relationCase.indexOf("authorizedRelationItem") <
      relationCase.indexOf("Items must belong to the same project"),
  );
});

test("follow-up responses identify the task created by the mutation", () => {
  assert.match(repository, /createdItemId = taskId/);
  assert.match(repository, /return \{ snapshot: await loadWorkspaceSnapshot\(identity\), createdItemId \}/);
});

test("follow-up collections are authorized before project comparison", () => {
  const followUpCase = repository.slice(
    repository.indexOf('case "create_follow_up_task"'),
    repository.indexOf('case "create_relation"'),
  );
  assert.match(
    followUpCase,
    /authorizedCollectionProject\(\s*user\.id,\s*mutation\.collectionId/,
  );
  assert.ok(
    followUpCase.indexOf("authorizedCollectionProject") <
      followUpCase.indexOf(
        "Follow-up task collection must belong to the event project",
      ),
  );
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

test("preview persistence and seed data use only todo and done task states", () => {
  assert.match(repository, /status IN \('todo','done'\)/);
  assert.doesNotMatch(repository, /status IN \('todo','in_progress','done'\)/);
  assert.doesNotMatch(repository, /^\s+"in_progress",$/m);
  assert.doesNotMatch(repository, /"todo" \| "in_progress" \| "done"/);
});
