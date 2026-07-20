import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: { DB: "two-state-task-migration-tests" },
});
const db = await mf.getD1Database("DB");

function statements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applyMigration(path) {
  const sql = await readFile(new URL(path, import.meta.url), "utf8");
  await db.batch(statements(sql).map((statement) => db.prepare(statement)));
}

await applyMigration("../drizzle/0000_tired_squirrel_girl.sql");
await applyMigration("../drizzle/0001_work_item_relations.sql");

await db.batch([
  db.prepare(
    "INSERT INTO users (id,email,display_name) VALUES ('user-1','owner@example.com','Owner')",
  ),
  db.prepare(
    "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES ('project-1','user-1','Project','','USD')",
  ),
  db.prepare(
    "INSERT INTO collections (id,project_id,name,color,position) VALUES ('collection-1','project-1','Collection','cyan',0)",
  ),
  db.prepare(`INSERT INTO work_items
    (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,created_by)
    VALUES
    ('task-legacy','project-1','collection-1','task','Legacy task','','in_progress','2026-07-20',NULL,'user-1'),
    ('task-blocked','project-1','collection-1','task','Blocked task','','todo','2026-07-21',NULL,'user-1'),
    ('task-done','project-1','collection-1','task','Done task','','done','2026-07-19',NULL,'user-1')`),
  db.prepare(`INSERT INTO file_objects
    (id,project_id,r2_key,filename,content_type,size_bytes,uploaded_by)
    VALUES
    ('file-item','project-1','item-key','item.txt','text/plain',4,'user-1'),
    ('file-receipt','project-1','receipt-key','receipt.pdf','application/pdf',8,'user-1')`),
  db.prepare(
    "INSERT INTO item_files (id,item_id,file_object_id,pinned,position) VALUES ('item-file-1','task-legacy','file-item',1,0)",
  ),
  db.prepare(
    "INSERT INTO payments (id,item_id,amount_minor,paid_on,note,created_by) VALUES ('payment-1','task-legacy',2500,'2026-07-19','Deposit','user-1')",
  ),
  db.prepare(
    "INSERT INTO payment_receipts (payment_id,file_object_id) VALUES ('payment-1','file-receipt')",
  ),
  db.prepare(`INSERT INTO work_item_relations
    (id,project_id,source_item_id,target_item_id,type,created_by)
    VALUES ('relation-1','project-1','task-legacy','task-blocked','blocks','user-1')`),
]);

await applyMigration("../drizzle/0002_rich_weapon_omega.sql");

test.after(async () => {
  await mf.dispose();
});

test("two-state migration preserves every work-item dependency", async () => {
  const tasks = await db
    .prepare("SELECT id,status FROM work_items ORDER BY id")
    .all();
  assert.deepEqual(tasks.results, [
    { id: "task-blocked", status: "todo" },
    { id: "task-done", status: "done" },
    { id: "task-legacy", status: "todo" },
  ]);

  const itemFile = await db
    .prepare("SELECT id,item_id,file_object_id,pinned,position FROM item_files")
    .first();
  assert.deepEqual(itemFile, {
    id: "item-file-1",
    item_id: "task-legacy",
    file_object_id: "file-item",
    pinned: 1,
    position: 0,
  });

  const payment = await db
    .prepare(
      "SELECT id,item_id,amount_minor,paid_on,note,created_by FROM payments",
    )
    .first();
  assert.deepEqual(payment, {
    id: "payment-1",
    item_id: "task-legacy",
    amount_minor: 2500,
    paid_on: "2026-07-19",
    note: "Deposit",
    created_by: "user-1",
  });

  const receipt = await db
    .prepare("SELECT payment_id,file_object_id FROM payment_receipts")
    .first();
  assert.deepEqual(receipt, {
    payment_id: "payment-1",
    file_object_id: "file-receipt",
  });

  const relation = await db
    .prepare(
      "SELECT id,project_id,source_item_id,target_item_id,type,created_by FROM work_item_relations",
    )
    .first();
  assert.deepEqual(relation, {
    id: "relation-1",
    project_id: "project-1",
    source_item_id: "task-legacy",
    target_item_id: "task-blocked",
    type: "blocks",
    created_by: "user-1",
  });

  await assert.rejects(
    () =>
      db
        .prepare(`INSERT INTO work_items
          (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,created_by)
          VALUES ('task-invalid','project-1','collection-1','task','Invalid task','','in_progress',NULL,NULL,'user-1')`)
        .run(),
    /CHECK constraint failed/i,
  );

  const foreignKeyViolations = await db
    .prepare("PRAGMA foreign_key_check")
    .all();
  assert.deepEqual(foreignKeyViolations.results, []);
});
