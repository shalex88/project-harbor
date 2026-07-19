import assert from "node:assert/strict";
import test from "node:test";
import {
  formatCurrentDate,
  localDateIso,
} from "../app/components/current-date.ts";

test("formats the current date in long English form", () => {
  const date = new Date(2026, 6, 16, 12);
  assert.equal(formatCurrentDate(date), "Thursday, July 16, 2026");
});

test("formats a date as a browser-local ISO calendar date", () => {
  const date = new Date(2026, 6, 16, 23, 30);
  assert.equal(localDateIso(date), "2026-07-16");
});
