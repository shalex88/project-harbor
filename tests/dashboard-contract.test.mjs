import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(
  new URL("../app/components/dashboards.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("dashboard source has no removed task metadata", () => {
  assert.ok(source.length > 0, "dashboard source must exist");
  assert.doesNotMatch(source, /priority|assignee/i);
});

test("timeline offers month week and agenda modes", () => {
  for (const mode of ["Month", "Week", "Agenda"]) {
    assert.match(source, new RegExp(`label: [\"']${mode}[\"']`));
  }
});

test("spending dashboard labels estimates actuals and variance", () => {
  for (const label of ["Estimated", "Actual spend", "Variance"]) {
    assert.match(source, new RegExp(label));
  }
});

test("event dashboard separates upcoming and past records", () => {
  assert.match(source, /Upcoming events/);
  assert.match(source, /Past events/);
});

test("dashboards expose the approved detailed filters and breakdown", () => {
  for (const label of [
    "Filter timeline by collection",
    "Filter timeline by task status",
    "Payment date from",
    "Payment date to",
    "Collection breakdown",
  ]) {
    assert.match(source, new RegExp(label));
  }
});

test("agenda exposes latest-first date sorting", () => {
  assert.match(source, /useUrlFilter\(["']order["'], ["']desc["']\)/);
  assert.match(source, /Sort agenda oldest first/);
  assert.match(source, /Sort agenda latest first/);
  assert.match(source, /agenda-sort-button/);
});

test("agenda marks only dates before the browser-local current date as past", () => {
  assert.match(source, /isPastAgendaDate\(date, currentDate\)/);
  assert.match(source, /agenda-day-past/);
  assert.doesNotMatch(source, />Past</);
});

test("every global dashboard work-item surface renders relation metadata", () => {
  assert.match(source, /@\/lib\/relation-metadata/);
  assert.match(source, /function TaskRow[\s\S]*?workItemMetadata/);
  assert.match(source, /function EventRow[\s\S]*?workItemMetadata/);
  assert.match(source, /agenda-item[\s\S]*?workItemMetadata/);
  assert.match(source, /calendar-item[\s\S]*?relationMetadataPhrases/);
  assert.match(source, /className="money-row"[\s\S]*?workItemMetadata/);
});

test("payment-history metadata remains payment focused", () => {
  const paymentFeed = source.slice(source.indexOf('className="payment-feed"'));
  assert.ok(paymentFeed.length > 0, "payment feed must exist");
  assert.doesNotMatch(paymentFeed, /workItemMetadata|relationMetadataPhrases/);
});
