# Timeline Period Label Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the active month or exact Sunday-through-Saturday week range in the Timeline calendar controls.

**Architecture:** Put UTC period formatting in a focused TypeScript helper so date boundaries can be tested without React. Put the visible label in a small presentational component, then compose it into the existing Timeline period controls and adapt the desktop/mobile control layout with scoped CSS.

**Tech Stack:** TypeScript, React 19, Node test runner, `tsx`, CSS

## Global Constraints

- Month view displays the full month and year.
- Week view displays the complete Sunday-through-Saturday range.
- Cross-month and cross-year ranges must keep both endpoints unambiguous.
- The label must be visible text beside the period navigation and remain legible on mobile.
- Agenda view, calendar anchoring, navigation, and filters remain unchanged.
- Week boundaries remain Sunday through Saturday.
- Formatting remains English and UTC; do not introduce localization settings.

---

### Task 1: Format timeline periods

**Files:**
- Create: `app/components/timeline-period.ts`
- Create: `tests/timeline-period.test.mjs`

**Interfaces:**
- Consumes: ISO calendar anchor strings in `YYYY-MM-DD` form and a `"month" | "week"` mode.
- Produces: `formatTimelinePeriod(anchor: string, mode: "month" | "week"): string`.

- [ ] **Step 1: Write the failing formatter tests**

Create `tests/timeline-period.test.mjs`:

```javascript
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
```

- [ ] **Step 2: Run the formatter tests and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/timeline-period.test.mjs
```

Expected: FAIL because `formatTimelinePeriod` does not exist.

- [ ] **Step 3: Implement the UTC formatter**

Create `app/components/timeline-period.ts` with:

```typescript
export type TimelineCalendarMode = "month" | "week";

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthDayFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  timeZone: "UTC",
});

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function startOfWeek(anchor: string): Date {
  const date = utcDate(anchor);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}

export function formatTimelinePeriod(
  anchor: string,
  mode: TimelineCalendarMode,
): string {
  const start = mode === "month" ? utcDate(anchor) : startOfWeek(anchor);
  if (mode === "month") return monthFormatter.format(start);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (sameMonth) {
    return `${monthDayFormatter.format(start)}–${dayFormatter.format(end)}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${monthDayFormatter.format(start)}–${monthDayFormatter.format(end)}, ${end.getUTCFullYear()}`;
  }
  return `${monthDayFormatter.format(start)}, ${start.getUTCFullYear()}–${monthDayFormatter.format(end)}, ${end.getUTCFullYear()}`;
}
```

- [ ] **Step 4: Run the formatter tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test tests/timeline-period.test.mjs
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit the formatter**

```bash
git add app/components/timeline-period.ts tests/timeline-period.test.mjs
git commit -m "Format timeline calendar periods"
```

### Task 2: Render the visible period label

**Files:**
- Create: `app/components/timeline-period-label.tsx`
- Modify: `app/components/dashboards.tsx:15-22,536-558`
- Modify: `app/globals.css:1032-1039,2464-2482`
- Create: `tests/timeline-period-label.test.mjs`

**Interfaces:**
- Consumes: `TimelinePeriodLabel({ anchor, mode })` where `anchor` is an ISO date and `mode` is `TimelineCalendarMode`.
- Produces: visible text with class `timeline-period-label` and polite live-region updates.

- [ ] **Step 1: Write the failing rendered-label test**

Create `tests/timeline-period-label.test.mjs`:

```javascript
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function renderLabel(anchor, mode) {
  const renderScript = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { TimelinePeriodLabel } from "./app/components/timeline-period-label.tsx";

    process.stdout.write(renderToStaticMarkup(
      React.createElement(TimelinePeriodLabel, {
        anchor: ${JSON.stringify(anchor)},
        mode: ${JSON.stringify(mode)},
      }),
    ));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", renderScript],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("renders the active timeline period as visible live text", () => {
  const monthHtml = renderLabel("2026-08-15", "month");
  const weekHtml = renderLabel("2026-08-15", "week");

  assert.match(
    monthHtml,
    /<strong class="timeline-period-label" aria-live="polite">August 2026<\/strong>/,
  );
  assert.match(weekHtml, />August 9–15, 2026<\/strong>/);
});
```

- [ ] **Step 2: Run the rendered-label test and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/timeline-period-label.test.mjs
```

Expected: FAIL because `timeline-period-label.tsx` does not exist.

- [ ] **Step 3: Create the presentational label component**

Create `app/components/timeline-period-label.tsx`:

```tsx
import {
  formatTimelinePeriod,
  type TimelineCalendarMode,
} from "./timeline-period";

export function TimelinePeriodLabel({
  anchor,
  mode,
}: {
  anchor: string;
  mode: TimelineCalendarMode;
}) {
  return (
    <strong className="timeline-period-label" aria-live="polite">
      {formatTimelinePeriod(anchor, mode)}
    </strong>
  );
}
```

- [ ] **Step 4: Run the rendered-label test and verify GREEN**

Run:

```bash
node --experimental-strip-types --test tests/timeline-period-label.test.mjs
```

Expected: 1 test passes.

- [ ] **Step 5: Compose the label into Timeline month and week controls**

In `app/components/dashboards.tsx`, import `TimelinePeriodLabel`, then replace
the current period-control children with:

```tsx
<div className="timeline-period-controls">
  <TimelinePeriodLabel anchor={anchor} mode={mode} />
  <div className="timeline-period-navigation">
    <button className="icon-button" type="button" aria-label="Previous period" onClick={() => setAnchor(shiftAnchor(anchor, mode, -1))}>‹</button>
    <button className="button button-secondary" type="button" onClick={() => setAnchor(todayIso())}>Today</button>
    <button className="icon-button" type="button" aria-label="Next period" onClick={() => setAnchor(shiftAnchor(anchor, mode, 1))}>›</button>
  </div>
</div>
```

Keep this block inside the existing `mode !== "agenda"` condition.

- [ ] **Step 6: Style desktop and mobile period controls**

In `app/globals.css`, keep the period label and navigation together on desktop:

```css
.timeline-period-controls,
.timeline-period-navigation {
  display: flex;
  align-items: center;
  gap: 6px;
}

.timeline-period-label {
  min-width: 164px;
  color: var(--text-primary);
  font-size: 14px;
  text-align: center;
  white-space: nowrap;
}
```

In the existing `@media (max-width: 640px)` block, replace the period-control
grid rule with:

```css
.timeline-period-controls {
  display: grid;
  grid-template-columns: 1fr;
}

.timeline-period-label {
  min-width: 0;
  white-space: normal;
}

.timeline-period-navigation {
  display: grid;
  grid-template-columns: 44px 1fr 44px;
}
```

- [ ] **Step 7: Run both focused tests**

Run:

```bash
node --experimental-strip-types --test \
  tests/timeline-period.test.mjs \
  tests/timeline-period-label.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 8: Commit the visible period label**

```bash
git add app/components/timeline-period-label.tsx app/components/dashboards.tsx app/globals.css tests/timeline-period-label.test.mjs
git commit -m "Show the active timeline period"
```

### Task 3: Verify the completed change

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the completed formatter, rendered label, Timeline integration, and responsive styles.
- Produces: fresh evidence that the requested behavior and repository checks pass.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: build succeeds and all Node tests pass.

- [ ] **Step 2: Run lint**

Run:

```bash
npm run lint
```

Expected: exit code 0 with no lint errors.

- [ ] **Step 3: Validate the deployable artifact**

Run:

```bash
npm run validate:artifact
```

Expected: exit code 0.

- [ ] **Step 4: Inspect month and week views**

Open:

```text
http://localhost:5173/timeline?anchor=2026-08-15&view=month
http://localhost:5173/timeline?anchor=2026-08-15&view=week
```

Verify the month label is `August 2026`, the week label is
`August 9–15, 2026`, navigation updates the label, Agenda has no period label,
and the label remains readable at a mobile viewport.

- [ ] **Step 5: Review the final diff**

Run:

```bash
git status -sb
git diff --check
git diff origin/main...HEAD
```

Expected: only the design, plan, formatter, label component, Timeline
composition, scoped CSS, and focused tests are included.
