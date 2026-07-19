# Past Agenda Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gray out Agenda date groups before the viewer's browser-local current date while keeping them fully interactive.

**Architecture:** Extend the existing current-date helper with a browser-local ISO formatter and add a pure Agenda past-date predicate. `TimelineDashboard` reads the local date through a hydration-safe external-store snapshot, adds one class at the grouped-day boundary, and lets focused CSS mute the complete historical group.

**Tech Stack:** React 19, TypeScript 5.9, CSS, Node test runner, `useSyncExternalStore`.

## Global Constraints

- A date is past only when it is earlier than the browser-local current date.
- Today and future dates remain unchanged.
- Apply the state only in Agenda view.
- Use gray styling only: no label, icon, or accent border.
- Preserve item click, focus, layout, and hit-area behavior.

---

## File Map

- `app/components/current-date.ts` — deterministic browser-local ISO date formatting.
- `app/components/agenda-date-state.ts` — pure past-date predicate.
- `app/components/dashboards.tsx` — hydration-safe local date snapshot and Agenda group class.
- `app/globals.css` — readable gray-only treatment for past groups.
- `tests/current-date.test.mjs` — local ISO formatter coverage.
- `tests/agenda-date-state.test.mjs` — yesterday/today/tomorrow boundary coverage.
- `tests/dashboard-contract.test.mjs` — Agenda past-state markup contract.
- `tests/mobile-contract.test.mjs` — gray styling contract.

### Task 1: Browser-local past-date behavior

**Files:**
- Modify: `app/components/current-date.ts`
- Create: `app/components/agenda-date-state.ts`
- Modify: `tests/current-date.test.mjs`
- Create: `tests/agenda-date-state.test.mjs`

**Interfaces:**
- Produces: `localDateIso(date: Date): string`.
- Produces: `isPastAgendaDate(date: string, currentDate: string): boolean`.

- [ ] **Step 1: Write failing date-boundary tests**

Append to `tests/current-date.test.mjs`:

```js
test("formats a date as a browser-local ISO calendar date", () => {
  const date = new Date(2026, 6, 16, 23, 30);
  assert.equal(localDateIso(date), "2026-07-16");
});
```

Create `tests/agenda-date-state.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { isPastAgendaDate } from "../app/components/agenda-date-state.ts";

test("only dates before the local current date are past", () => {
  assert.equal(isPastAgendaDate("2026-07-15", "2026-07-16"), true);
  assert.equal(isPastAgendaDate("2026-07-16", "2026-07-16"), false);
  assert.equal(isPastAgendaDate("2026-07-17", "2026-07-16"), false);
  assert.equal(isPastAgendaDate("2026-07-15", ""), false);
});
```

- [ ] **Step 2: Run tests and verify RED**

Run: `node --experimental-strip-types --test tests/current-date.test.mjs tests/agenda-date-state.test.mjs`

Expected: FAIL because `localDateIso` and `agenda-date-state.ts` do not exist.

- [ ] **Step 3: Implement the minimal pure helpers**

Append to `app/components/current-date.ts`:

```ts
export function localDateIso(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
```

Create `app/components/agenda-date-state.ts`:

```ts
export function isPastAgendaDate(
  date: string,
  currentDate: string,
): boolean {
  return currentDate !== "" && date < currentDate;
}
```

- [ ] **Step 4: Run tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/current-date.test.mjs tests/agenda-date-state.test.mjs`

Expected: 3 tests PASS with 0 failures.

### Task 2: Agenda group state and gray-only presentation

**Files:**
- Modify: `app/components/dashboards.tsx`
- Modify: `app/globals.css`
- Modify: `tests/dashboard-contract.test.mjs`
- Modify: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Consumes: `localDateIso(date)` and `isPastAgendaDate(date, currentDate)`.
- Produces: `.agenda-day-past` only for Agenda date groups before the browser-local current date.

- [ ] **Step 1: Write failing integration contracts**

Append to `tests/dashboard-contract.test.mjs`:

```js
test("agenda marks only dates before the browser-local current date as past", () => {
  assert.match(source, /isPastAgendaDate\(date, currentDate\)/);
  assert.match(source, /agenda-day-past/);
  assert.doesNotMatch(source, />Past</);
});
```

Append to `tests/mobile-contract.test.mjs`:

```js
test("past agenda groups use gray-only styling", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.agenda-day-past/);
  assert.match(css, /\.agenda-day-past[\s\S]*color:\s*var\(--text-muted\)/);
});
```

- [ ] **Step 2: Run integration contracts and verify RED**

Run: `node --test tests/dashboard-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: FAIL because the past class and CSS do not exist.

- [ ] **Step 3: Add the hydration-safe current-date snapshot**

In `app/components/dashboards.tsx`, import `localDateIso` and `isPastAgendaDate`, then add stable snapshot functions beside the existing timeline helpers:

```ts
const subscribeToCurrentDate = () => () => {};
const getCurrentDateSnapshot = () => localDateIso(new Date());
const getCurrentDateServerSnapshot = () => "";
```

Inside `TimelineDashboard`, add:

```ts
const currentDate = useSyncExternalStore(
  subscribeToCurrentDate,
  getCurrentDateSnapshot,
  getCurrentDateServerSnapshot,
);
```

Apply the group class without changing its contents or click handlers:

```tsx
<section
  className={`agenda-day ${
    isPastAgendaDate(date, currentDate) ? "agenda-day-past" : ""
  }`}
  key={date}
>
```

- [ ] **Step 4: Add focused gray-only styling**

Add after the base `.agenda-day` styles in `app/globals.css`:

```css
.agenda-day-past {
  background: rgb(102 129 152 / 6%);
}

.agenda-day-past > header strong,
.agenda-day-past .agenda-item > span,
.agenda-day-past .agenda-item > strong,
.agenda-day-past .agenda-item small {
  color: var(--text-muted);
}

.agenda-day-past .agenda-item > strong,
.agenda-day-past > header strong {
  opacity: 0.78;
}
```

- [ ] **Step 5: Run focused verification**

Run: `node --experimental-strip-types --test tests/current-date.test.mjs tests/agenda-date-state.test.mjs tests/dashboard-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: all focused tests PASS with 0 failures.

- [ ] **Step 6: Run full verification**

Run: `npm test && npm run lint && git diff --check`

Expected: production build, all tests, lint, and whitespace checks PASS with 0 failures.

- [ ] **Step 7: Verify the live Agenda**

Render Agenda at desktop width with at least one date before the current date and confirm that the complete historical group is gray and lower contrast while today/future groups preserve cyan and seafoam labels. Confirm a past item still opens normally.

- [ ] **Step 8: Commit and publish**

Stage only the plan, helper, dashboard, CSS, and test files; commit with `feat: distinguish past agenda items`, push `codex/sidebar-current-date`, and create a PR against `main` summarizing both the sidebar-date and past-Agenda changes on the branch.
