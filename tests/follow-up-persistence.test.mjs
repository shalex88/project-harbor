import assert from "node:assert/strict";
import test from "node:test";

import { Miniflare } from "miniflare";

import {
  loadAuthorizedFollowUpContext,
  persistFollowUpItem,
} from "../lib/follow-up-persistence.ts";

async function createFixture(name) {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: { DB: name },
  });
  const db = await mf.getD1Database("DB");

  await db.batch([
    db.prepare("PRAGMA foreign_keys = ON"),
    db.prepare("CREATE TABLE users (id TEXT PRIMARY KEY NOT NULL)"),
    db.prepare("CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL)"),
    db.prepare(`CREATE TABLE project_members (
      project_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      role TEXT NOT NULL,
      PRIMARY KEY(project_id, user_id)
    )`),
    db.prepare(`CREATE TABLE collections (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      UNIQUE(id, project_id)
    )`),
    db.prepare(`CREATE TABLE work_items (
      id TEXT PRIMARY KEY NOT NULL,
      project_id TEXT NOT NULL,
      collection_id TEXT NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('task','event')),
      title TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      status TEXT,
      due_date TEXT,
      occurrence_date TEXT,
      estimated_cost_minor INTEGER,
      created_by TEXT NOT NULL,
      UNIQUE(id, project_id),
      FOREIGN KEY(collection_id, project_id) REFERENCES collections(id, project_id),
      FOREIGN KEY(created_by) REFERENCES users(id)
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
      FOREIGN KEY(target_item_id, project_id) REFERENCES work_items(id, project_id),
      FOREIGN KEY(created_by) REFERENCES users(id)
    )`),
    db.prepare("CREATE TABLE rollback_guard (id TEXT PRIMARY KEY NOT NULL)"),
    db.prepare("INSERT INTO users (id) VALUES ('owner'),('outsider')"),
    db.prepare("INSERT INTO projects (id) VALUES ('project-a'),('project-b')"),
    db.prepare(`INSERT INTO project_members (project_id,user_id,role) VALUES
      ('project-a','owner','owner'),
      ('project-b','owner','member'),
      ('project-b','outsider','member')`),
    db.prepare(`INSERT INTO collections (id,project_id) VALUES
      ('collection-a','project-a'),
      ('collection-b','project-b')`),
    db.prepare(`INSERT INTO work_items
      (id,project_id,collection_id,type,title,status,occurrence_date,created_by)
      VALUES
      ('task-source','project-a','collection-a','task','Task source','todo',NULL,'owner'),
      ('event-source','project-a','collection-a','event','Event source',NULL,'2026-08-01','owner')`),
    db.prepare("INSERT INTO rollback_guard (id) VALUES ('taken')"),
  ]);

  return { mf, db };
}

test("follow-up persistence executes all source and destination combinations", async () => {
  const { mf, db } = await createFixture("follow-up-combination-tests");
  try {
    for (const sourceType of ["task", "event"]) {
      for (const destinationType of ["task", "event"]) {
        const sourceItemId = `${sourceType}-source`;
        const itemId = `${sourceType}-to-${destinationType}`;
        const context = await loadAuthorizedFollowUpContext(
          db,
          "owner",
          sourceItemId,
          "collection-a",
        );
        assert.deepEqual(context, {
          status: "ok",
          source: {
            id: sourceItemId,
            projectId: "project-a",
            type: sourceType,
          },
          collectionProjectId: "project-a",
        });

        await persistFollowUpItem(db, {
          itemId,
          relationId: `relation-${itemId}`,
          sourceItemId,
          projectId: "project-a",
          collectionId: "collection-a",
          createdBy: "owner",
          title: `${sourceType} to ${destinationType}`,
          description: "",
          estimatedCostMinor: null,
          ...(destinationType === "task"
            ? { type: "task", status: "todo", dueDate: "2026-08-15" }
            : { type: "event", occurrenceDate: "2026-08-16" }),
        });

        assert.deepEqual(
          await db
            .prepare("SELECT type,status,due_date,occurrence_date FROM work_items WHERE id = ?")
            .bind(itemId)
            .first(),
          destinationType === "task"
            ? {
                type: "task",
                status: "todo",
                due_date: "2026-08-15",
                occurrence_date: null,
              }
            : {
                type: "event",
                status: null,
                due_date: null,
                occurrence_date: "2026-08-16",
              },
        );
        assert.deepEqual(
          await db
            .prepare("SELECT source_item_id,target_item_id,type FROM work_item_relations WHERE id = ?")
            .bind(`relation-${itemId}`)
            .first(),
          {
            source_item_id: sourceItemId,
            target_item_id: itemId,
            type: "follows_from",
          },
        );
      }
    }
  } finally {
    await mf.dispose();
  }
});

test("follow-up authorization hides inaccessible records and detects project mismatches", async () => {
  const { mf, db } = await createFixture("follow-up-authorization-tests");
  try {
    assert.deepEqual(
      await loadAuthorizedFollowUpContext(
        db,
        "outsider",
        "task-source",
        "collection-a",
      ),
      { status: "source_not_found" },
    );
    assert.deepEqual(
      await loadAuthorizedFollowUpContext(
        db,
        "owner",
        "missing-source",
        "collection-a",
      ),
      { status: "source_not_found" },
    );
    assert.deepEqual(
      await loadAuthorizedFollowUpContext(
        db,
        "owner",
        "task-source",
        "missing-collection",
      ),
      { status: "collection_not_found" },
    );
    assert.deepEqual(
      await loadAuthorizedFollowUpContext(
        db,
        "owner",
        "task-source",
        "collection-b",
      ),
      { status: "project_mismatch" },
    );
  } finally {
    await mf.dispose();
  }
});

test("follow-up item and relation roll back together when the batch fails", async () => {
  const { mf, db } = await createFixture("follow-up-rollback-tests");
  try {
    await assert.rejects(() =>
      persistFollowUpItem(
        db,
        {
          itemId: "rolled-back-item",
          relationId: "rolled-back-relation",
          sourceItemId: "task-source",
          projectId: "project-a",
          collectionId: "collection-a",
          createdBy: "owner",
          type: "task",
          title: "Must roll back",
          description: "",
          status: "todo",
          dueDate: null,
          estimatedCostMinor: null,
        },
        [db.prepare("INSERT INTO rollback_guard (id) VALUES ('taken')")],
      ),
    );

    assert.equal(
      await db
        .prepare("SELECT COUNT(*) AS count FROM work_items WHERE id = 'rolled-back-item'")
        .first("count"),
      0,
    );
    assert.equal(
      await db
        .prepare("SELECT COUNT(*) AS count FROM work_item_relations WHERE id = 'rolled-back-relation'")
        .first("count"),
      0,
    );
  } finally {
    await mf.dispose();
  }
});
