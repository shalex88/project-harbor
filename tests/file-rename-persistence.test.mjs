import assert from "node:assert/strict";
import test from "node:test";

import { Miniflare } from "miniflare";

import { FILE_RENAME_UPDATE_SQL } from "../lib/file-rename-persistence.ts";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: { DB: "file-rename-persistence-tests" },
});
const db = await mf.getD1Database("DB");

await db.batch([
  db.prepare(`CREATE TABLE file_objects (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    r2_key TEXT NOT NULL,
    filename TEXT NOT NULL,
    content_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    uploaded_by TEXT NOT NULL,
    imported_uploader_label TEXT,
    created_at TEXT NOT NULL
  )`),
  db
    .prepare(`INSERT INTO file_objects (
      id,
      project_id,
      r2_key,
      filename,
      content_type,
      size_bytes,
      uploaded_by,
      imported_uploader_label,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(
      "file-1",
      "project-1",
      "projects/project-1/file-1",
      "plans.PDF",
      "application/pdf",
      42,
      "member-1",
      "Imported author",
      "2026-07-20T10:00:00.000Z",
    ),
]);

test.after(async () => {
  await mf.dispose();
});

test("file rename persistence updates only filename metadata", async () => {
  const before = await db
    .prepare("SELECT * FROM file_objects WHERE id = ?")
    .bind("file-1")
    .first();

  await db
    .prepare(FILE_RENAME_UPDATE_SQL)
    .bind("Quarterly plan.PDF", "file-1")
    .run();

  const after = await db
    .prepare("SELECT * FROM file_objects WHERE id = ?")
    .bind("file-1")
    .first();

  assert.deepEqual(after, {
    ...before,
    filename: "Quarterly plan.PDF",
  });
});
