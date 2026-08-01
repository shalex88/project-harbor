import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const repository = await readFile(
  new URL("../lib/repository.ts", import.meta.url),
  "utf8",
);

function mutationCase(action, nextAction) {
  return repository.slice(
    repository.indexOf(`case "${action}"`),
    repository.indexOf(`case "${nextAction}"`),
  );
}

test("item mutations validate contact state before one atomic batch", () => {
  const createItem = mutationCase("create_item", "update_item");
  const updateItem = mutationCase("update_item", "delete_item");
  const followUp = mutationCase("create_follow_up_task", "create_relation");

  for (const source of [createItem, updateItem, followUp]) {
    assert.match(source, /validateWorkItemContactState\(/);
    assert.match(source, /appendContactStateStatements\(/);
    assert.match(source, /await db\.batch\(statements\)/);
  }
});

test("contact statement helper replaces links before inserting complete state", () => {
  assert.match(
    repository,
    /function appendContactStateStatements\([\s\S]*?replace: boolean/,
  );
  const helper = repository.slice(
    repository.indexOf("function appendContactStateStatements"),
    repository.indexOf("export async function loadWorkspaceSnapshot"),
  );
  assert.match(helper, /DELETE FROM work_item_contacts WHERE item_id = \?/);
  assert.match(helper, /WORK_ITEM_CONTACT_INSERT_SQL/);
  assert.match(helper, /WORK_ITEM_CONTACT_MENTION_INSERT_SQL/);
  assert.ok(
    helper.indexOf("DELETE FROM work_item_contacts") <
      helper.indexOf("WORK_ITEM_CONTACT_INSERT_SQL"),
  );
});

test("snapshot metadata maps database booleans and mention ids", () => {
  assert.match(repository, /manuallyLinked: Boolean\(row\.manually_linked\)/);
  assert.match(repository, /contactId: row\.contact_id/);
  assert.match(repository, /startOffset: row\.start_offset/);
  assert.match(repository, /endOffset: row\.end_offset/);
});
