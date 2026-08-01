import assert from "node:assert/strict";
import test from "node:test";

import { nextFollowUpMenuIndex } from "../app/components/follow-up-menu-navigation.ts";

test("follow-up menu navigation wraps with arrow keys", () => {
  assert.equal(nextFollowUpMenuIndex("ArrowDown", 0, 2), 1);
  assert.equal(nextFollowUpMenuIndex("ArrowDown", 1, 2), 0);
  assert.equal(nextFollowUpMenuIndex("ArrowUp", 0, 2), 1);
  assert.equal(nextFollowUpMenuIndex("ArrowUp", 1, 2), 0);
});

test("follow-up menu navigation handles boundaries and unrelated keys", () => {
  assert.equal(nextFollowUpMenuIndex("Home", 1, 2), 0);
  assert.equal(nextFollowUpMenuIndex("End", 0, 2), 1);
  assert.equal(nextFollowUpMenuIndex("Escape", 0, 2), null);
  assert.equal(nextFollowUpMenuIndex("ArrowDown", 0, 0), null);
});
