import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { Miniflare } from "miniflare";

import {
  WORK_ITEM_CONTACT_INSERT_SQL,
  WORK_ITEM_CONTACT_MENTION_INSERT_SQL,
  validateWorkItemContactState,
} from "../lib/work-item-contact-persistence.ts";

const contacts = [
  { id: "dana", projectId: "project-1", name: "דנה כהן" },
  { id: "maya", projectId: "project-1", name: "Maya Levi" },
  { id: "other", projectId: "project-2", name: "Other Person" },
];

test("contact state deduplicates manual and mentioned links", () => {
  const state = validateWorkItemContactState({
    projectId: "project-1",
    title: "Call @דנה כהן and @דנה כהן",
    description: "Email @Maya Levi",
    manualContactIds: ["dana"],
    contactMentions: [
      {
        contactId: "dana",
        field: "title",
        startOffset: 5,
        endOffset: 13,
      },
      {
        contactId: "dana",
        field: "title",
        startOffset: 18,
        endOffset: 26,
      },
      {
        contactId: "maya",
        field: "description",
        startOffset: 6,
        endOffset: 16,
      },
    ],
    contacts,
  });

  assert.deepEqual(state.links, [
    { contactId: "dana", manuallyLinked: true },
    { contactId: "maya", manuallyLinked: false },
  ]);
  assert.equal(state.mentions.length, 3);
});

test("contact state rejects foreign contacts, overlaps, and false labels", () => {
  const base = {
    projectId: "project-1",
    title: "Call @דנה כהן",
    description: "",
    manualContactIds: [],
    contacts,
  };

  assert.throws(
    () =>
      validateWorkItemContactState({
        ...base,
        manualContactIds: ["other"],
        contactMentions: [],
      }),
    /contact is not available in this project/i,
  );
  assert.throws(
    () =>
      validateWorkItemContactState({
        ...base,
        contactMentions: [
          {
            contactId: "dana",
            field: "title",
            startOffset: 5,
            endOffset: 13,
          },
          {
            contactId: "dana",
            field: "title",
            startOffset: 7,
            endOffset: 13,
          },
        ],
      }),
    /must not overlap/i,
  );
  assert.throws(
    () =>
      validateWorkItemContactState({
        ...base,
        contactMentions: [
          {
            contactId: "dana",
            field: "title",
            startOffset: 0,
            endOffset: 4,
          },
        ],
      }),
    /does not match the contact name/i,
  );
});

test("database constraints reject cross-project links and cascade mentions", async () => {
  const mf = new Miniflare({
    modules: true,
    script: "export default { fetch() { return new Response('ok'); } }",
    d1Databases: { DB: "work-item-contact-persistence-tests" },
  });
  const db = await mf.getD1Database("DB");
  try {
    await db.batch([
      db.prepare("PRAGMA foreign_keys = ON"),
      db.prepare("CREATE TABLE projects (id TEXT PRIMARY KEY NOT NULL)"),
      db.prepare(`CREATE TABLE project_contacts (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        name TEXT NOT NULL,
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`),
      db.prepare(`CREATE TABLE work_items (
        id TEXT PRIMARY KEY NOT NULL,
        project_id TEXT NOT NULL,
        title TEXT NOT NULL,
        UNIQUE(id, project_id),
        FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
      )`),
    ]);

    const migration = await readFile(
      new URL(
        "../drizzle/0006_work_item_contact_mentions.sql",
        import.meta.url,
      ),
      "utf8",
    );
    for (const statement of migration.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) await db.prepare(sql).run();
    }

    await db.batch([
      db.prepare("INSERT INTO projects (id) VALUES ('project-1'),('project-2')"),
      db.prepare(
        "INSERT INTO project_contacts (id,project_id,name) VALUES ('dana','project-1','דנה כהן'),('other','project-2','Other')",
      ),
      db.prepare(
        "INSERT INTO work_items (id,project_id,title) VALUES ('task-1','project-1','Call @דנה כהן')",
      ),
    ]);

    await assert.rejects(() =>
      db
        .prepare(WORK_ITEM_CONTACT_INSERT_SQL)
        .bind("project-1", "task-1", "other", 0)
        .run(),
    );

    await db
      .prepare(WORK_ITEM_CONTACT_INSERT_SQL)
      .bind("project-1", "task-1", "dana", 0)
      .run();
    await db
      .prepare(WORK_ITEM_CONTACT_MENTION_INSERT_SQL)
      .bind("mention-1", "project-1", "task-1", "dana", "title", 5, 13)
      .run();

    await db.prepare("DELETE FROM project_contacts WHERE id = 'dana'").run();
    assert.equal(
      await db.prepare("SELECT COUNT(*) AS count FROM work_item_contacts").first("count"),
      0,
    );
    assert.equal(
      await db
        .prepare("SELECT COUNT(*) AS count FROM work_item_contact_mentions")
        .first("count"),
      0,
    );
    assert.equal(
      await db.prepare("SELECT title FROM work_items WHERE id = 'task-1'").first("title"),
      "Call @דנה כהן",
    );
  } finally {
    await mf.dispose();
  }
});
