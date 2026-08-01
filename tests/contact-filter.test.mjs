import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_CONTACT_PROJECTS,
  contactsForProject,
  normalizeContactProjectFilter,
} from "../lib/contact-filter.ts";

const contacts = [
  { id: "contact-a", projectId: "project-a" },
  { id: "contact-b", projectId: "project-b" },
  { id: "contact-c", projectId: "project-a" },
];

test("all projects preserves the authorized aggregate directory", () => {
  assert.equal(ALL_CONTACT_PROJECTS, "all");
  assert.deepEqual(contactsForProject(contacts, ALL_CONTACT_PROJECTS), contacts);
});

test("a project selection returns only that project's contacts", () => {
  assert.deepEqual(contactsForProject(contacts, "project-a"), [
    contacts[0],
    contacts[2],
  ]);
});

test("removed project selections reset to all projects", () => {
  const projects = [{ id: "project-a" }, { id: "project-b" }];
  assert.equal(normalizeContactProjectFilter("project-a", projects), "project-a");
  assert.equal(normalizeContactProjectFilter("missing", projects), "all");
  assert.equal(normalizeContactProjectFilter("all", projects), "all");
});
