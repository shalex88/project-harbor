import assert from "node:assert/strict";
import test from "node:test";

import * as menuNavigation from "../app/components/follow-up-menu-navigation.ts";

const { nextFollowUpMenuIndex } = menuNavigation;

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

test("follow-up menu Escape is consumed before sheet-level handlers", () => {
  const calls = [];
  let restoreFocus = false;
  const handled = menuNavigation.handleFollowUpMenuEscape?.(
    {
      key: "Escape",
      preventDefault: () => calls.push("preventDefault"),
      stopPropagation: () => calls.push("stopPropagation"),
    },
    (restore) => {
      restoreFocus = restore;
    },
  );

  assert.equal(handled, true);
  assert.deepEqual(calls, ["preventDefault", "stopPropagation"]);
  assert.equal(restoreFocus, true);
});
