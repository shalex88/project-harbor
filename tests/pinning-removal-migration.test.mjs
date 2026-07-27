import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: { DB: "pinning-removal-tests" },
});
const db = await mf.getD1Database("DB");

function statements(sql) {
  return sql
    .split("--> statement-breakpoint")
    .map((statement) => statement.trim())
    .filter(Boolean);
}

async function applySql(sql) {
  if (!sql) return;
  await db.batch(statements(sql).map((statement) => db.prepare(statement)));
}

await applySql(
  await readFile(
    new URL("../drizzle/0000_tired_squirrel_girl.sql", import.meta.url),
    "utf8",
  ),
);
await db.batch([
  db.prepare(
    "INSERT INTO users (id,email,display_name) VALUES ('u','u@example.com','User')",
  ),
  db.prepare(
    "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES ('p','u','P','','USD')",
  ),
  db.prepare(
    "INSERT INTO collections (id,project_id,name,color,position) VALUES ('c','p','C','cyan',0)",
  ),
  db.prepare(
    "INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,created_by) VALUES ('i','p','c','task','I','','todo',NULL,NULL,'u')",
  ),
  db.prepare(
    "INSERT INTO file_objects (id,project_id,r2_key,filename,content_type,size_bytes,uploaded_by) VALUES ('f','p','key','f.txt','text/plain',1,'u')",
  ),
  db.prepare(
    "INSERT INTO item_files (id,item_id,file_object_id,pinned,position,created_at) VALUES ('if','i','f',1,7,'2026-07-01T00:00:00.000Z')",
  ),
]);
await applySql(
  await readFile(
    new URL(
      "../drizzle/0004_remove_item_file_pinning.sql",
      import.meta.url,
    ),
    "utf8",
  ).catch(() => ""),
);

test.after(async () => {
  await mf.dispose();
});

test("migration preserves item-file relationships and removes pinned", async () => {
  const columns = await db.prepare("PRAGMA table_info(item_files)").all();
  assert.equal(
    columns.results.some((column) => column.name === "pinned"),
    false,
  );
  assert.deepEqual(
    await db
      .prepare(
        "SELECT id,item_id,file_object_id,position,created_at FROM item_files",
      )
      .first(),
    {
      id: "if",
      item_id: "i",
      file_object_id: "f",
      position: 7,
      created_at: "2026-07-01T00:00:00.000Z",
    },
  );
  assert.deepEqual(
    (await db.prepare("PRAGMA foreign_key_check").all()).results,
    [],
  );
});
