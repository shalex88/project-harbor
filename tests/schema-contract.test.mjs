import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import test from "node:test";

const drizzle = new URL("../drizzle/", import.meta.url);
const migrationFiles = (await readdir(drizzle))
  .filter((file) => file.endsWith(".sql"))
  .sort();
assert.ok(migrationFiles.length, "a D1 migration must exist");
const migrationSources = await Promise.all(
  migrationFiles.map((file) => readFile(new URL(file, drizzle), "utf8")),
);
const migration = migrationSources.join("\n");

test("work item persistence enforces project and type invariants", () => {
  assert.match(
    migration,
    /FOREIGN KEY \(`collection_id`,\s*`project_id`\) REFERENCES `collections`\(`id`,\s*`project_id`\)/,
  );
  assert.match(migration, /work_items_type_fields_check/);
  assert.match(migration, /work_items_estimated_cost_check/);
});

test("work item relationships are project scoped and reject invalid rows", () => {
  assert.match(migration, /CREATE TABLE `work_item_relations`/);
  assert.match(migration, /work_item_relations_type_check/);
  assert.match(migration, /work_item_relations_distinct_items_check/);
  assert.match(migration, /work_item_relations_related_order_check/);
  assert.match(migration, /work_item_relations_unique/);
  assert.match(
    migration,
    /FOREIGN KEY \(`source_item_id`,\s*`project_id`\) REFERENCES `work_items`\(`id`,\s*`project_id`\)/,
  );
  assert.match(
    migration,
    /FOREIGN KEY \(`target_item_id`,\s*`project_id`\) REFERENCES `work_items`\(`id`,\s*`project_id`\)/,
  );
});

test("task status migration maps in-progress rows before enforcing two states", () => {
  const twoStateMigration =
    migrationSources.find((source) =>
      /UPDATE work_items SET status = 'todo' WHERE status = 'in_progress'/.test(
        source,
      ),
    ) ?? "";
  const updateIndex = twoStateMigration.indexOf(
    "UPDATE work_items SET status = 'todo' WHERE status = 'in_progress'",
  );
  const constraintIndex = twoStateMigration.indexOf("IN ('todo', 'done')");

  assert.ok(updateIndex >= 0, "migration must normalize in-progress tasks");
  assert.ok(
    constraintIndex > updateIndex,
    "normalization must precede the new constraint",
  );
});
