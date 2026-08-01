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
    'case "create_follow_up_item"',
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

test("follow-up responses identify the item created by the mutation", () => {
  assert.match(repository, /createdItemId = itemId/);
  assert.match(repository, /return \{ snapshot: await loadWorkspaceSnapshot\(identity\), createdItemId \}/);
});

test("follow-up creation authorizes generic source and collection before comparing projects", () => {
  const followUpCase = repository.slice(
    repository.indexOf('case "create_follow_up_item"'),
    repository.indexOf('case "create_relation"'),
  );
  assert.match(
    followUpCase,
    /authorizedRelationItem\(\s*user\.id,\s*mutation\.sourceItemId/,
  );
  assert.match(
    followUpCase,
    /authorizedCollectionProject\(\s*user\.id,\s*mutation\.collectionId/,
  );
  assert.doesNotMatch(followUpCase, /source\.type\s*!==\s*"event"/);
  assert.ok(
    followUpCase.indexOf("authorizedCollectionProject") <
      followUpCase.indexOf(
        "Follow-up item collection must belong to the source project",
      ),
  );
});

test("follow-up creation inserts either item type and batches the relation", () => {
  const followUpCase = repository.slice(
    repository.indexOf('case "create_follow_up_item"'),
    repository.indexOf('case "create_relation"'),
  );
  assert.match(followUpCase, /mutation\.type === "task"/);
  assert.match(followUpCase, /'task'/);
  assert.match(followUpCase, /'event'/);
  assert.match(followUpCase, /source\.id,\s*itemId/);
  assert.match(followUpCase, /'follows_from'/);
  assert.match(followUpCase, /appendContactStateStatements\(statements/);
  assert.match(followUpCase, /await db\.batch\(statements\)/);
  assert.match(followUpCase, /createdItemId = itemId/);
});

test("workspace snapshots load authorized relationship records", () => {
  assert.match(repository, /const relationRows = await all/);
  assert.match(repository, /relations: relationRows\.map/);
  assert.match(repository, /JOIN project_members current ON current\.project_id = wir\.project_id/);
});

test("workspace snapshots load membership-scoped contacts in name order", () => {
  assert.match(repository, /const contacts = await all/);
  assert.match(repository, /FROM project_contacts pc/);
  assert.match(
    repository,
    /JOIN project_members current ON current\.project_id = pc\.project_id/,
  );
  assert.match(repository, /WHERE current\.user_id = \?/);
  assert.match(repository, /ORDER BY pc\.name COLLATE NOCASE,pc\.id/);
  assert.match(repository, /contacts: contacts\.map<ContactRecord>/);
});

test("workspace snapshots load stable project-scoped item contact metadata", () => {
  assert.match(repository, /const contactLinkRows = await all/);
  assert.match(repository, /FROM work_item_contacts wic/);
  assert.match(repository, /const contactMentionRows = await all/);
  assert.match(repository, /FROM work_item_contact_mentions wicm/);
  assert.match(
    repository,
    /JOIN project_members current ON current\.project_id = wic\.project_id/,
  );
  assert.match(
    repository,
    /JOIN project_members current ON current\.project_id = wicm\.project_id/,
  );
  assert.match(repository, /ORDER BY wic\.item_id,wic\.contact_id/);
  assert.match(
    repository,
    /ORDER BY wicm\.item_id,wicm\.field,wicm\.start_offset,wicm\.end_offset,wicm\.id/,
  );
  assert.match(repository, /contactLinks: contactLinksByItem\.get\(row\.id\) \?\? \[\]/);
  assert.match(
    repository,
    /contactMentions: contactMentionsByItem\.get\(row\.id\) \?\? \[\]/,
  );
});

test("preview persistence and seed data use only todo and done task states", () => {
  assert.match(repository, /status IN \('todo','done'\)/);
  assert.doesNotMatch(repository, /status IN \('todo','in_progress','done'\)/);
  assert.doesNotMatch(repository, /^\s+"in_progress",$/m);
  assert.doesNotMatch(repository, /"todo" \| "in_progress" \| "done"/);
});

test("workspace snapshots prefer imported display labels without changing actor ids", () => {
  assert.match(
    repository,
    /CASE WHEN wi\.imported_creator_label IS NOT NULL THEN wi\.imported_creator_label \|\| ' \(imported\)' ELSE creator\.display_name END AS created_by_name/,
  );
  assert.match(
    repository,
    /CASE WHEN p\.imported_creator_label IS NOT NULL THEN p\.imported_creator_label \|\| ' \(imported\)' ELSE u\.display_name END AS display_name/,
  );
  assert.match(
    repository,
    /CASE WHEN fo\.imported_uploader_label IS NOT NULL THEN fo\.imported_uploader_label \|\| ' \(imported\)' ELSE uploader\.display_name END AS uploaded_by_name/,
  );
  assert.match(repository, /createdBy: row\.created_by/);
  assert.match(repository, /uploadedBy: row\.uploaded_by/);
});
