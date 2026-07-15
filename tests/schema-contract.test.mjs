import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const drizzle = new URL("../drizzle/", import.meta.url);
const migrationFile = (await readdir(drizzle)).find((file) => file.endsWith(".sql"));
assert.ok(migrationFile, "a D1 migration must exist");
const migration = await readFile(new URL(migrationFile, drizzle), "utf8");

test("work item persistence enforces project and type invariants", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(`collection_id`,\s*`project_id`\) REFERENCES `collections`\(`id`,\s*`project_id`\)/,
  );
  assert.match(migration, /work_items_type_fields_check/);
  assert.match(migration, /work_items_estimated_cost_check/);
});
