import assert from "node:assert/strict";
import test from "node:test";

import { Miniflare } from "miniflare";

import {
  DIRECTED_RELATION_INSERT_SQL,
  directedRelationInsertParams,
  isRelationUniqueConstraint,
} from "../lib/relation-persistence.ts";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: { DB: "relation-persistence-tests" },
});
const db = await mf.getD1Database("DB");

await db.batch([
  db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL)"),
  db.prepare("CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL)"),
  db.prepare(`CREATE TABLE work_items (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    type TEXT NOT NULL,
    UNIQUE(id, project_id)
  )`),
  db.prepare(`CREATE TABLE work_item_relations (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    source_item_id TEXT NOT NULL,
    target_item_id TEXT NOT NULL,
    type TEXT NOT NULL,
    created_by TEXT NOT NULL,
    UNIQUE(project_id, type, source_item_id, target_item_id),
    FOREIGN KEY(source_item_id, project_id) REFERENCES work_items(id, project_id),
    FOREIGN KEY(target_item_id, project_id) REFERENCES work_items(id, project_id)
  )`),
  db.prepare("INSERT INTO users (id) VALUES ('user-1')"),
  db.prepare("INSERT INTO projects (id) VALUES ('project-1')"),
  db.prepare(`INSERT INTO work_items (id, project_id, type) VALUES
    ('task-a', 'project-1', 'task'),
    ('task-b', 'project-1', 'task')`),
]);

test.after(async () => {
  await mf.dispose();
});

async function insertDirected(
  id,
  sourceItemId,
  targetItemId,
  type = "blocks",
) {
  return db
    .prepare(DIRECTED_RELATION_INSERT_SQL)
    .bind(
      ...directedRelationInsertParams({
        id,
        projectId: "project-1",
        sourceItemId,
        targetItemId,
        type,
        createdBy: "user-1",
      }),
    )
    .run();
}

test("guarded directed inserts atomically prevent opposite edges", async () => {
  const results = await Promise.all([
    insertDirected("relation-a", "task-a", "task-b"),
    insertDirected("relation-b", "task-b", "task-a"),
  ]);

  assert.deepEqual(
    results.map((result) => result.meta.changes).sort(),
    [0, 1],
  );
  const count = await db
    .prepare("SELECT COUNT(*) AS count FROM work_item_relations")
    .first();
  assert.equal(count.count, 1);
});

test("unique constraint failures are recognizable as relation conflicts", async () => {
  await insertDirected(
    "relation-follows",
    "task-a",
    "task-b",
    "follows_from",
  );
  await assert.rejects(
    () =>
      insertDirected(
        "relation-duplicate",
        "task-a",
        "task-b",
        "follows_from",
      ),
    (error) => {
      assert.equal(isRelationUniqueConstraint(error), true);
      return true;
    },
  );
});
