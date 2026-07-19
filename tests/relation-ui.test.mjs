import assert from "node:assert/strict";
import test from "node:test";

import {
  isRelationCandidateAvailable,
  relationMutation,
} from "../lib/relation-ui.ts";

const item = { id: "task-a", projectId: "project-1", type: "task" };
const candidate = { id: "task-b", projectId: "project-1", type: "task" };

test("candidate filtering excludes only the exact relationship meaning", () => {
  const relations = [
    {
      id: "relation-1",
      projectId: "project-1",
      sourceItemId: "task-a",
      targetItemId: "task-b",
      type: "blocks",
      createdBy: "user-1",
      createdAt: "2026-07-19T00:00:00.000Z",
    },
  ];

  assert.equal(
    isRelationCandidateAvailable(item, candidate, "blocks", relations),
    false,
  );
  assert.equal(
    isRelationCandidateAvailable(item, candidate, "related_to", relations),
    true,
  );
  assert.equal(
    isRelationCandidateAvailable(item, candidate, "follows_from", relations),
    true,
  );
});

test("relationship meanings map to directed endpoints", () => {
  assert.deepEqual(relationMutation("task-a", "task-b", "blocked_by"), {
    sourceItemId: "task-b",
    targetItemId: "task-a",
    relationType: "blocks",
  });
  assert.deepEqual(relationMutation("task-z", "task-a", "related_to"), {
    sourceItemId: "task-a",
    targetItemId: "task-z",
    relationType: "related_to",
  });
});

test("events do not offer task-only blocking relationships", () => {
  assert.equal(
    isRelationCandidateAvailable(
      { id: "event-a", projectId: "project-1", type: "event" },
      candidate,
      "blocks",
      [],
    ),
    false,
  );
});
