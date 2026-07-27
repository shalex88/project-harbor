import assert from "node:assert/strict";
import test from "node:test";

const timelinePeriodModule = await import(
  "../app/components/timeline-period.ts"
).catch(() => ({}));
const { formatTimelinePeriod } = timelinePeriodModule;

test("formats a month with its full year", () => {
  assert.equal(typeof formatTimelinePeriod, "function");
  assert.equal(formatTimelinePeriod("2026-08-15", "month"), "August 2026");
});

test("keeps the month label aligned with the grid when the day overflows", () => {
  assert.equal(formatTimelinePeriod("2026-02-29", "month"), "February 2026");
});

test("keeps the month label renderable when the day is malformed", () => {
  assert.equal(formatTimelinePeriod("2026-08-foo", "month"), "August 2026");
});

test("formats a week contained in one month", () => {
  assert.equal(
    formatTimelinePeriod("2026-08-15", "week"),
    "August 9–15, 2026",
  );
});

test("formats a week spanning two months", () => {
  assert.equal(
    formatTimelinePeriod("2026-08-01", "week"),
    "July 26–August 1, 2026",
  );
});

test("formats a week spanning two years", () => {
  assert.equal(
    formatTimelinePeriod("2027-01-01", "week"),
    "December 27, 2026–January 2, 2027",
  );
});
