import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_CONTACT_PROJECTS,
  contactProjectFilterAfterNavigation,
  contactProjectForCreate,
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

test("contact creation defaults to the filtered project when it is valid", () => {
  const projects = [{ id: "project-a" }, { id: "project-b" }];
  assert.equal(
    contactProjectForCreate("project-b", projects),
    "project-b",
  );
  assert.equal(
    contactProjectForCreate(ALL_CONTACT_PROJECTS, projects),
    "project-a",
  );
  assert.equal(
    contactProjectForCreate("removed", projects),
    "project-a",
  );
  assert.equal(
    contactProjectForCreate(ALL_CONTACT_PROJECTS, []),
    undefined,
  );
});

test("entering Contacts resets the project filter without affecting other routes", () => {
  assert.equal(
    contactProjectFilterAfterNavigation("project-b", "contacts"),
    ALL_CONTACT_PROJECTS,
  );
  assert.equal(
    contactProjectFilterAfterNavigation("project-b", "tasks"),
    "project-b",
  );
});
