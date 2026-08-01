import assert from "node:assert/strict";
import test from "node:test";

import { Miniflare } from "miniflare";

import {
  AUTHORIZED_CONTACT_PROJECT_SQL,
  CONTACT_DELETE_SQL,
  CONTACT_INSERT_SQL,
  CONTACT_UPDATE_SQL,
  findAuthorizedContactProject,
} from "../lib/contact-persistence.ts";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: { DB: "contact-persistence-tests" },
});
const db = await mf.getD1Database("DB");

await db.batch([
  db.prepare(`CREATE TABLE project_members (
    project_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    role TEXT NOT NULL,
    PRIMARY KEY(project_id, user_id)
  )`),
  db.prepare(`CREATE TABLE project_contacts (
    id TEXT PRIMARY KEY NOT NULL,
    project_id TEXT NOT NULL,
    name TEXT NOT NULL,
    role_or_company TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`),
  db.prepare(`INSERT INTO project_members (project_id, user_id, role) VALUES
    ('project-1', 'owner-1', 'owner'),
    ('project-1', 'member-1', 'member'),
    ('project-2', 'outsider-1', 'member')`),
]);

test.after(async () => {
  await mf.dispose();
});

test("contact persistence authorizes members without exposing inaccessible ids", async () => {
  await db
    .prepare(CONTACT_INSERT_SQL)
    .bind(
      "contact-1",
      "project-1",
      "Dana Cohen",
      "Architect",
      "dana@example.com",
      "+972 50 123 4567",
      "Planning contact",
    )
    .run();

  assert.equal(
    await findAuthorizedContactProject(db, "owner-1", "contact-1"),
    "project-1",
  );
  assert.equal(
    await findAuthorizedContactProject(db, "member-1", "contact-1"),
    "project-1",
  );
  assert.equal(
    await findAuthorizedContactProject(db, "outsider-1", "contact-1"),
    null,
  );
  assert.equal(
    await findAuthorizedContactProject(db, "outsider-1", "missing-contact"),
    null,
  );
  assert.match(AUTHORIZED_CONTACT_PROJECT_SQL, /JOIN project_members/);

  await db
    .prepare(CONTACT_UPDATE_SQL)
    .bind(
      "Dana Levi",
      "Lead architect",
      "dana@example.com",
      "+972 50 123 4567",
      "Updated",
      "contact-1",
    )
    .run();
  assert.deepEqual(
    await db
      .prepare("SELECT project_id, name, role_or_company, notes FROM project_contacts WHERE id = ?")
      .bind("contact-1")
      .first(),
    {
      project_id: "project-1",
      name: "Dana Levi",
      role_or_company: "Lead architect",
      notes: "Updated",
    },
  );

  await db.prepare(CONTACT_DELETE_SQL).bind("contact-1").run();
  assert.equal(
    await db
      .prepare("SELECT id FROM project_contacts WHERE id = ?")
      .bind("contact-1")
      .first(),
    null,
  );
});
