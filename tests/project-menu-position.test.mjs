import assert from "node:assert/strict";
import test from "node:test";

import { calculateProjectMenuPosition } from "../app/components/project-menu-position.ts";

const base = {
  trigger: { top: 20, right: 200, bottom: 64 },
  menu: { width: 174, height: 56 },
  viewport: { width: 1200, height: 800 },
};

test("right-aligns the menu below its trigger", () => {
  assert.deepEqual(calculateProjectMenuPosition(base), { top: 70, left: 26 });
});

test("flips the menu above when it would cross the bottom margin", () => {
  assert.deepEqual(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 700, right: 200, bottom: 744 },
    }),
    { top: 638, left: 26 },
  );
});

test("clamps the menu inside the horizontal viewport margins", () => {
  assert.equal(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 20, right: 150, bottom: 64 },
    }).left,
    8,
  );
  assert.equal(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 20, right: 1200, bottom: 64 },
    }).left,
    1018,
  );
});

test("clamps vertical placement in a viewport smaller than the menu", () => {
  assert.equal(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 3, right: 200, bottom: 47 },
      menu: { width: 174, height: 90 },
      viewport: { width: 1200, height: 80 },
    }).top,
    8,
  );
});
