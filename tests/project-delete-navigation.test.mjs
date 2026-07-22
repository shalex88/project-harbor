import assert from "node:assert/strict";
import test from "node:test";

test("only deleting the currently open project leaves the project route", async () => {
  const navigation = await import(
    "../app/components/project-delete-navigation.ts"
  ).catch(() => ({}));
  const shouldLeaveDeletedProjectRoute =
    navigation.shouldLeaveDeletedProjectRoute;

  assert.equal(
    typeof shouldLeaveDeletedProjectRoute,
    "function",
    "project delete navigation helper must exist",
  );
  assert.equal(
    shouldLeaveDeletedProjectRoute("project", "project-1", "project-1"),
    true,
  );
  assert.equal(
    shouldLeaveDeletedProjectRoute("spending", "project-1", "project-1"),
    false,
  );
  assert.equal(
    shouldLeaveDeletedProjectRoute("project", "project-2", "project-1"),
    false,
  );
  assert.equal(
    shouldLeaveDeletedProjectRoute("project", null, "project-1"),
    false,
  );
});
