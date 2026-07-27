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
