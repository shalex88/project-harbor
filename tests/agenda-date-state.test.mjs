import assert from "node:assert/strict";
import test from "node:test";
import { isPastAgendaDate } from "../app/components/agenda-date-state.ts";

test("only dates before the local current date are past", () => {
  assert.equal(isPastAgendaDate("2026-07-15", "2026-07-16"), true);
  assert.equal(isPastAgendaDate("2026-07-16", "2026-07-16"), false);
  assert.equal(isPastAgendaDate("2026-07-17", "2026-07-16"), false);
  assert.equal(isPastAgendaDate("2026-07-15", ""), false);
});
