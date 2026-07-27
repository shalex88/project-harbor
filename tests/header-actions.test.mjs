import assert from "node:assert/strict";
import test from "node:test";

const headerActionsModule = await import(
  "../app/components/header-actions.ts"
).catch(() => ({}));
const { headerActionsForRoute } = headerActionsModule;

test("timeline offers task creation before event creation", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(headerActionsForRoute("timeline"), {
    secondary: "task",
    primary: "event",
  });
});

test("spending offers no creation actions", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(headerActionsForRoute("spending"), {});
});

test("other routes preserve their existing primary creation action", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(
    Object.fromEntries(
      ["overview", "tasks", "events", "project"].map((route) => [
        route,
        headerActionsForRoute(route),
      ]),
    ),
    {
      overview: { primary: "project" },
      tasks: { primary: "task" },
      events: { primary: "event" },
      project: { primary: "task" },
    },
  );
});
