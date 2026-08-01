import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../lib/repository.ts", import.meta.url),
  "utf8",
);

test("contact creation authorizes project membership before inserting", () => {
  const contactCase = source.slice(
    source.indexOf('case "create_contact"'),
    source.indexOf('case "update_contact"'),
  );
  assert.match(contactCase, /requireProjectAccess\(user\.id, mutation\.projectId\)/);
  assert.match(contactCase, /INSERT INTO project_contacts/);
  assert.ok(
    contactCase.indexOf("requireProjectAccess") <
      contactCase.indexOf("INSERT INTO project_contacts"),
  );
});

test("contact updates authorize the stored project and cannot move contacts", () => {
  const contactCase = source.slice(
    source.indexOf('case "update_contact"'),
    source.indexOf('case "delete_contact"'),
  );
  assert.match(contactCase, /projectForContact\(mutation\.contactId\)/);
  assert.match(contactCase, /requireProjectAccess\(user\.id, projectId\)/);
  assert.match(contactCase, /UPDATE project_contacts SET name/);
  assert.doesNotMatch(contactCase, /project_id\s*=/i);
});

test("contact deletion authorizes the stored project before deleting", () => {
  const contactCase = source.slice(
    source.indexOf('case "delete_contact"'),
    source.indexOf('case "create_collection"'),
  );
  assert.match(contactCase, /projectForContact\(mutation\.contactId\)/);
  assert.match(contactCase, /requireProjectAccess\(user\.id, projectId\)/);
  assert.match(contactCase, /DELETE FROM project_contacts WHERE id = \?/);
  assert.ok(
    contactCase.indexOf("requireProjectAccess") <
      contactCase.indexOf("DELETE FROM project_contacts"),
  );
});

test("missing contacts fail without revealing another project", () => {
  assert.match(source, /async function projectForContact/);
  assert.match(source, /Contact not found/);
  assert.match(source, /"not_found"/);
});
