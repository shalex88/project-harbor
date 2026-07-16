# Agenda Date Sort Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an accessible Agenda header arrow that defaults the Timeline Agenda to latest-first ordering and toggles to oldest-first ordering.

**Architecture:** Keep the shared `projectTimeline` projection unchanged. Add a small pure Agenda sorting module beside the dashboard component, then let `TimelineDashboard` derive an Agenda-only ordered list from its already filtered entries while storing the non-default order in the existing URL filter system.

**Tech Stack:** React 19, TypeScript 5.9, Vinext/Next App Router, CSS, Node test runner.

## Global Constraints

- The sort control appears only in Agenda view.
- Descending date order is the default and omits the URL parameter.
- Only `asc` selects ascending order; unsupported values fall back to descending.
- Month and Week views keep the existing `projectTimeline` order and grouping.
- Items on the same date stay ordered by title ascending.
- The control remains a 44 px keyboard- and touch-accessible button with a visible focus state.

---

## File Map

- `app/components/agenda-sort.ts` — pure order normalization and immutable Agenda sorting.
- `app/components/dashboards.tsx` — URL-backed Agenda order, header action, and Agenda-specific grouping.
- `app/globals.css` — focused Agenda arrow color and size.
- `tests/agenda-sort.test.mjs` — pure sorting and fallback behavior.
- `tests/dashboard-contract.test.mjs` — source contract for default URL state and accessible toggle copy.

### Task 1: Pure Agenda order behavior

**Files:**
- Create: `app/components/agenda-sort.ts`
- Create: `tests/agenda-sort.test.mjs`

**Interfaces:**
- Consumes: timeline entries shaped as `{ date: string; title: string }`.
- Produces: `AgendaSortOrder`, `normalizeAgendaSortOrder(value)`, and `sortAgendaEntries(entries, order)`.

- [ ] **Step 1: Write the failing order tests**

```js
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
  assert.deepEqual(entries.map((entry) => entry.id), ["early", "late-b", "late-a"]);
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run: `node --experimental-strip-types --test tests/agenda-sort.test.mjs`

Expected: FAIL because `app/components/agenda-sort.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure helper**

```ts
export type AgendaSortOrder = "desc" | "asc";

export function normalizeAgendaSortOrder(value: string): AgendaSortOrder {
  return value === "asc" ? "asc" : "desc";
}

export function sortAgendaEntries<T extends { date: string; title: string }>(
  entries: readonly T[],
  order: AgendaSortOrder,
): T[] {
  return [...entries].sort((left, right) => {
    const dateOrder =
      order === "desc"
        ? right.date.localeCompare(left.date)
        : left.date.localeCompare(right.date);
    return dateOrder || left.title.localeCompare(right.title);
  });
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run: `node --experimental-strip-types --test tests/agenda-sort.test.mjs`

Expected: 2 tests PASS with 0 failures.

- [ ] **Step 5: Commit the pure behavior**

```bash
git add app/components/agenda-sort.ts tests/agenda-sort.test.mjs
git commit -m "feat: define agenda date ordering"
```

### Task 2: Agenda header control and URL-backed state

**Files:**
- Modify: `app/components/dashboards.tsx:1-10,438-534`
- Modify: `app/globals.css:890-930`
- Modify: `tests/dashboard-contract.test.mjs`

**Interfaces:**
- Consumes: `normalizeAgendaSortOrder` and `sortAgendaEntries` from Task 1 plus the existing `useUrlFilter(parameter, defaultValue)` hook.
- Produces: an Agenda-only `order` URL state and header action that toggles between `desc` and `asc`.

- [ ] **Step 1: Add a failing dashboard contract test**

Append to `tests/dashboard-contract.test.mjs`:

```js
test("agenda exposes latest-first date sorting", () => {
  assert.match(source, /useUrlFilter\(["']order["'], ["']desc["']\)/);
  assert.match(source, /Sort agenda oldest first/);
  assert.match(source, /Sort agenda latest first/);
  assert.match(source, /agenda-sort-button/);
});
```

- [ ] **Step 2: Run the dashboard contract to verify it fails**

Run: `node --test tests/dashboard-contract.test.mjs`

Expected: FAIL in `agenda exposes latest-first date sorting` because the order state and control are absent.

- [ ] **Step 3: Wire Agenda order without changing Month or Week**

Import the helper in `app/components/dashboards.tsx`:

```ts
import {
  normalizeAgendaSortOrder,
  sortAgendaEntries,
} from "./agenda-sort";
```

Inside `TimelineDashboard`, add URL state beside the other filters and derive Agenda-only entries and groups:

```ts
const [orderValue, setOrderValue] = useUrlFilter("order", "desc");
const order = normalizeAgendaSortOrder(orderValue);
const agendaEntries = useMemo(
  () => sortAgendaEntries(entries, order),
  [entries, order],
);
const agendaByDate = useMemo(() => {
  const result = new Map<string, Array<WorkItemRecord & { date: string }>>();
  for (const entry of agendaEntries) {
    result.set(entry.date, [...(result.get(entry.date) ?? []), entry]);
  }
  return result;
}, [agendaEntries]);
```

Keep the existing `byDate` map for Month and Week. Update only the Agenda panel:

```tsx
<Panel
  title="Agenda"
  count={entries.length}
  action={
    <button
      className="icon-button agenda-sort-button"
      type="button"
      aria-label={
        order === "desc"
          ? "Sort agenda oldest first"
          : "Sort agenda latest first"
      }
      title={
        order === "desc"
          ? "Sort agenda oldest first"
          : "Sort agenda latest first"
      }
      onClick={() => setOrderValue(order === "desc" ? "asc" : "desc")}
    >
      <span aria-hidden="true">{order === "desc" ? "↓" : "↑"}</span>
    </button>
  }
>
  <div className="agenda-list">
    {[...agendaByDate.entries()].map(([date, items]) => (
      <section className="agenda-day" key={date}>
        <header>
          <strong>{prettyDate(date)}</strong>
          <span>{items.length} item{items.length === 1 ? "" : "s"}</span>
        </header>
        <div>
          {items.map((item) => (
            <button
              className={`agenda-item agenda-${item.type}`}
              type="button"
              key={item.id}
              onClick={() => onOpenItem(item.id)}
            >
              <span>{item.type === "task" ? "Task" : "Event"}</span>
              <strong>{item.title}</strong>
              <small>
                {projectName(snapshot, item.projectId)} ·{" "}
                {collectionName(snapshot, item.collectionId)}
              </small>
            </button>
          ))}
        </div>
      </section>
    ))}
    {!entries.length ? (
      <EmptyState
        title="Nothing on the timeline"
        description="Dated tasks and events will appear in chronological order."
      />
    ) : null}
  </div>
</Panel>
```

- [ ] **Step 4: Add the focused visual treatment**

Add to `app/globals.css` after `.timeline-period-controls`:

```css
.agenda-sort-button {
  color: var(--cyan);
  font-size: 20px;
}
```

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/agenda-sort.test.mjs tests/dashboard-contract.test.mjs`

Expected: all focused tests PASS with 0 failures.

- [ ] **Step 6: Run full verification**

Run: `npm test`

Expected: the production build completes and all repository tests PASS with 0 failures.

- [ ] **Step 7: Commit the Agenda control**

```bash
git add app/components/dashboards.tsx app/globals.css tests/dashboard-contract.test.mjs
git commit -m "feat: add agenda date sort control"
```
