import assert from "node:assert/strict";
import test from "node:test";
import {
  normalizeAgendaSortOrder,
  sortAgendaEntries,
} from "../app/components/agenda-sort.ts";

const entries = [
  { id: "early", date: "2026-07-16", title: "Early" },
  { id: "late-b", date: "2026-07-28", title: "Beta" },
  { id: "late-a", date: "2026-07-28", title: "Alpha" },
];

test("agenda order defaults unsupported values to descending", () => {
  assert.equal(normalizeAgendaSortOrder("desc"), "desc");
  assert.equal(normalizeAgendaSortOrder("asc"), "asc");
  assert.equal(normalizeAgendaSortOrder("unexpected"), "desc");
});

test("agenda entries sort by date direction and title", () => {
  assert.deepEqual(
    sortAgendaEntries(entries, "desc").map((entry) => entry.id),
    ["late-a", "late-b", "early"],
  );
  assert.deepEqual(
    sortAgendaEntries(entries, "asc").map((entry) => entry.id),
    ["early", "late-a", "late-b"],
  );
  assert.deepEqual(
    entries.map((entry) => entry.id),
    ["early", "late-b", "late-a"],
  );
});
