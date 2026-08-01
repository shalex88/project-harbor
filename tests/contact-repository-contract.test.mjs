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
  assert.match(contactCase, /CONTACT_INSERT_SQL/);
  assert.ok(
    contactCase.indexOf("requireProjectAccess") <
      contactCase.indexOf("CONTACT_INSERT_SQL"),
  );
});

test("contact updates authorize the stored project and cannot move contacts", () => {
  const contactCase = source.slice(
    source.indexOf('case "update_contact"'),
    source.indexOf('case "delete_contact"'),
  );
  assert.match(contactCase, /authorizedContactProject\(user\.id, mutation\.contactId\)/);
  assert.match(contactCase, /CONTACT_UPDATE_SQL/);
  assert.doesNotMatch(contactCase, /project_id\s*=/i);
});

test("contact deletion authorizes the stored project before deleting", () => {
  const contactCase = source.slice(
    source.indexOf('case "delete_contact"'),
    source.indexOf('case "create_collection"'),
  );
  assert.match(contactCase, /authorizedContactProject\(user\.id, mutation\.contactId\)/);
  assert.match(contactCase, /CONTACT_DELETE_SQL/);
  assert.ok(
    contactCase.indexOf("authorizedContactProject") <
      contactCase.indexOf("CONTACT_DELETE_SQL"),
  );
});

test("missing contacts fail without revealing another project", () => {
  assert.match(source, /async function authorizedContactProject/);
  assert.match(source, /findAuthorizedContactProject/);
  assert.match(source, /Contact not found/);
  assert.match(source, /"not_found"/);
});
