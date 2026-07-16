import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrentDate } from "../app/components/current-date.ts";

test("formats the current date in long English form", () => {
  const date = new Date(2026, 6, 16, 12);
  assert.equal(formatCurrentDate(date), "Thursday, July 16, 2026");
});
