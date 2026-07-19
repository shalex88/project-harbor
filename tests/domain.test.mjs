import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMoney,
  moneyInputValue,
  normalizeRelationEndpoints,
  parseMoneyToMinor,
  projectTimeline,
  summarizeItemMoney,
  summarizeSpending,
  validateCollectionOrder,
  validateCurrency,
  validateIsoDate,
  validateWorkspaceRoute,
  validateTaskStatus,
  validateRelationType,
} from "../lib/domain.ts";

test("task status accepts only todo, in_progress, and done", () => {
  assert.equal(validateTaskStatus("todo"), "todo");
  assert.equal(validateTaskStatus("in_progress"), "in_progress");
  assert.equal(validateTaskStatus("done"), "done");
  assert.throws(() => validateTaskStatus("review"), /invalid task status/);
});

test("relationship types accept only the supported fixed set", () => {
  assert.equal(validateRelationType("follows_from"), "follows_from");
  assert.equal(validateRelationType("blocks"), "blocks");
  assert.equal(validateRelationType("related_to"), "related_to");
  assert.throws(() => validateRelationType("duplicates"), /invalid relationship type/i);
});

test("symmetric relationships use canonical endpoint order", () => {
  assert.deepEqual(
    normalizeRelationEndpoints("related_to", "item-z", "item-a"),
    { sourceItemId: "item-a", targetItemId: "item-z" },
  );
  assert.deepEqual(
    normalizeRelationEndpoints("blocks", "item-z", "item-a"),
    { sourceItemId: "item-z", targetItemId: "item-a" },
  );
});

test("relationships reject self-links", () => {
  assert.throws(
    () => normalizeRelationEndpoints("follows_from", "item-a", "item-a"),
    /cannot relate an item to itself/i,
  );
});

test("money conversion uses integer minor units", () => {
  assert.equal(parseMoneyToMinor("123.45"), 12_345);
  assert.equal(parseMoneyToMinor("0"), 0);
  assert.equal(parseMoneyToMinor(""), null);
  assert.throws(() => parseMoneyToMinor("12.345"), /valid amount/);
  assert.equal(formatMoney(12_345, "USD"), "$123.45");
  assert.equal(parseMoneyToMinor("123", "JPY"), 123);
  assert.throws(() => parseMoneyToMinor("123.45", "JPY"), /valid amount/);
  assert.match(formatMoney(123, "JPY"), /123/);
  assert.equal(moneyInputValue(12_345, "USD"), "123.45");
  assert.equal(moneyInputValue(123, "JPY"), "123");
  assert.equal(validateCurrency("ILS"), "ILS");
  assert.throws(() => validateCurrency("ZZZ"), /supported/);
});

test("actual spend and variance derive from payments", () => {
  assert.deepEqual(
    summarizeItemMoney(10_000, [
      { amountMinor: 4_000 },
      { amountMinor: 7_500 },
    ]),
    {
      estimatedMinor: 10_000,
      actualMinor: 11_500,
      varianceMinor: 1_500,
    },
  );
  assert.deepEqual(summarizeItemMoney(null, [{ amountMinor: 1_000 }]), {
    estimatedMinor: null,
    actualMinor: 1_000,
    varianceMinor: null,
  });
});

test("timeline excludes undated tasks and sorts dated tasks with events", () => {
  const entries = projectTimeline([
    {
      id: "task-1",
      type: "task",
      title: "Undated",
      dueDate: null,
      occurrenceDate: null,
      status: "todo",
    },
    {
      id: "task-2",
      type: "task",
      title: "Release notes",
      dueDate: "2026-07-18",
      occurrenceDate: null,
      status: "in_progress",
    },
    {
      id: "event-1",
      type: "event",
      title: "Beta handoff",
      dueDate: null,
      occurrenceDate: "2026-07-17",
      status: null,
    },
  ]);

  assert.deepEqual(
    entries.map(({ id, date, type }) => ({ id, date, type })),
    [
      { id: "event-1", date: "2026-07-17", type: "event" },
      { id: "task-2", date: "2026-07-18", type: "task" },
    ],
  );
});

test("collection order rejects duplicates and omissions", () => {
  assert.deepEqual(
    validateCollectionOrder(["a", "b"], ["b", "a"]),
    ["b", "a"],
  );
  assert.throws(
    () => validateCollectionOrder(["a", "b"], ["a", "a"]),
    /does not match/,
  );
});

test("date validation rejects impossible calendar dates", () => {
  assert.equal(validateIsoDate("2028-02-29", "Date"), "2028-02-29");
  assert.throws(
    () => validateIsoDate("2026-02-30", "Date"),
    /valid date/,
  );
});

test("workspace routes reject inaccessible projects and mismatched collections", () => {
  const projects = [{ id: "project-a" }];
  const collections = [{ id: "collection-a", projectId: "project-a" }];
  assert.deepEqual(
    validateWorkspaceRoute(projects, collections, "project-a", "collection-a"),
    { projectId: "project-a", collectionId: "collection-a" },
  );
  assert.throws(
    () => validateWorkspaceRoute(projects, collections, "project-b"),
    /Project not found/,
  );
  assert.throws(
    () => validateWorkspaceRoute(projects, collections, "project-a", "collection-b"),
    /Collection not found/,
  );
});

test("spending summaries stay grouped by currency", () => {
  const groups = summarizeSpending([
    {
      currency: "USD",
      estimatedMinor: 10_000,
      actualMinor: 8_000,
    },
    {
      currency: "EUR",
      estimatedMinor: 5_000,
      actualMinor: 6_000,
    },
    {
      currency: "USD",
      estimatedMinor: null,
      actualMinor: 3_000,
    },
  ]);

  assert.deepEqual(groups, [
    {
      currency: "EUR",
      estimatedMinor: 5_000,
      actualMinor: 6_000,
      varianceMinor: 1_000,
    },
    {
      currency: "USD",
      estimatedMinor: 10_000,
      actualMinor: 11_000,
      varianceMinor: -2_000,
    },
  ]);
});
