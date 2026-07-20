# Consistent Task Status Indicators Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace dashboard task checkboxes and ad-hoc status text with one shared `To do` / `Done` status chip, including every Timeline mode.

**Architecture:** A focused `TaskStatusChip` component owns status copy and status-specific classes. Existing dashboard and project-workspace task surfaces consume it, while responsive CSS provides only a compact visual modifier for constrained calendar cells.

**Tech Stack:** React 19, TypeScript, Vinext, CSS, Node test runner

## Global Constraints

- Task status labels are exactly `To do` and `Done`.
- Dashboard task indicators must not use checkbox or checkmark representations.
- The task editor keeps its status select because it is an editing control.
- Event presentations remain unchanged.
- No data model, API, mutation, or migration changes are allowed.
- Compact Timeline rendering must retain the full visible status label.

---

### Task 1: Shared task status component

**Files:**
- Create: `app/components/task-status-chip.tsx`
- Modify: `tests/dashboard-contract.test.mjs`

**Interfaces:**
- Consumes: `TaskRecord["status"]` from `@/lib/domain`.
- Produces: `TaskStatusChip({ status, compact? }: { status: TaskRecord["status"]; compact?: boolean }): React.JSX.Element`.

- [ ] **Step 1: Write the failing component contract test**

Add a source read for `app/components/task-status-chip.tsx`, then assert that the shared component owns both canonical labels, status classes, and the optional compact modifier:

```js
const taskStatusSource = await readFile(
  new URL("../app/components/task-status-chip.tsx", import.meta.url),
  "utf8",
).catch(() => "");

test("shared task status chip owns canonical dashboard status presentation", () => {
  assert.ok(taskStatusSource.length > 0, "task status component must exist");
  assert.match(taskStatusSource, /TaskRecord\["status"\]/);
  assert.match(taskStatusSource, /status === "done" \? "Done" : "To do"/);
  assert.match(taskStatusSource, /status-chip/);
  assert.match(taskStatusSource, /status-\$\{status\}/);
  assert.match(taskStatusSource, /status-chip-compact/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --loader @esbuild-kit/esm-loader --test tests/dashboard-contract.test.mjs`

Expected: FAIL at `task status component must exist` because the component file has not been created.

- [ ] **Step 3: Implement the minimal shared component**

Create `app/components/task-status-chip.tsx`:

```tsx
import type { TaskRecord } from "@/lib/domain";

export function TaskStatusChip({
  status,
  compact = false,
}: {
  status: TaskRecord["status"];
  compact?: boolean;
}) {
  return (
    <span
      className={`status-chip status-${status}${compact ? " status-chip-compact" : ""}`}
    >
      {status === "done" ? "Done" : "To do"}
    </span>
  );
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --loader @esbuild-kit/esm-loader --test tests/dashboard-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit the component**

```bash
git add app/components/task-status-chip.tsx tests/dashboard-contract.test.mjs
git commit -m "feat: add shared task status chip"
```

---

### Task 2: Standardize global dashboards and Timeline

**Files:**
- Modify: `app/components/dashboards.tsx`
- Modify: `tests/dashboard-contract.test.mjs`

**Interfaces:**
- Consumes: `TaskStatusChip` from `./task-status-chip`.
- Produces: one explicit status chip per task in shared task rows, Timeline Agenda/Month/Week, and Spending task entries.

- [ ] **Step 1: Write failing dashboard consistency tests**

Add assertions that `dashboards.tsx` imports and uses the shared component, contains no `.task-check` presentation, renders task status in both Timeline branches, and does not render a generic task checkmark:

```js
test("global dashboards use one shared task status indicator", () => {
  assert.match(source, /import \{ TaskStatusChip \} from "\.\/task-status-chip"/);
  assert.doesNotMatch(source, /task-check/);
  assert.match(source, /function TaskRow[\s\S]*?<TaskStatusChip status=\{item\.status\}/);
  assert.match(source, /className="money-row"[\s\S]*?item\.type === "task"[\s\S]*?<TaskStatusChip/);
});

test("every timeline mode shows explicit task status labels", () => {
  const timeline = source.slice(
    source.indexOf("export function TimelineDashboard"),
    source.indexOf("export function SpendingDashboard"),
  );
  assert.match(timeline, /agenda-item[\s\S]*?item\.type === "task"[\s\S]*?<TaskStatusChip status=\{item\.status\}/);
  assert.match(timeline, /calendar-item[\s\S]*?item\.type === "task"[\s\S]*?<TaskStatusChip status=\{item\.status\} compact/);
  assert.doesNotMatch(timeline, /item\.type === "task" \? "✓"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --loader @esbuild-kit/esm-loader --test tests/dashboard-contract.test.mjs`

Expected: FAIL because `dashboards.tsx` still renders `.task-check`, its local status label, and Timeline's generic task marker.

- [ ] **Step 3: Replace global dashboard status presentation**

In `app/components/dashboards.tsx`:

- import `TaskStatusChip` and remove the local `statusLabel` function;
- remove the leading `.task-check` from `TaskRow` and render `<TaskStatusChip status={item.status} />` once before the arrow;
- in Agenda, render `<TaskStatusChip status={item.status} />` for tasks and the existing `Event` type label for events;
- in Month and Week cells, render `<TaskStatusChip status={item.status} compact />` for tasks and preserve the event icon for events;
- in Spending over-estimate rows, render `<TaskStatusChip status={item.status} />` only when `item.type === "task"`.

The Timeline branches must narrow the discriminated union before reading `item.status`:

```tsx
{item.type === "task" ? (
  <TaskStatusChip status={item.status} compact />
) : (
  <span aria-hidden="true">◷</span>
)}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --loader @esbuild-kit/esm-loader --test tests/dashboard-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit global dashboard integration**

```bash
git add app/components/dashboards.tsx tests/dashboard-contract.test.mjs
git commit -m "feat: standardize dashboard task statuses"
```

---

### Task 3: Standardize project collection task rows

**Files:**
- Modify: `app/components/project-workspace.tsx`
- Modify: `tests/workflow-contract.test.mjs`

**Interfaces:**
- Consumes: `TaskStatusChip` from `./task-status-chip`.
- Produces: one visible task-status chip per project collection task row, with no repeated status metadata.

- [ ] **Step 1: Write the failing project-row contract test**

```js
test("project task rows use one shared status indicator", () => {
  assert.match(projectSource, /import \{ TaskStatusChip \} from "\.\/task-status-chip"/);
  assert.doesNotMatch(projectSource, /task-check/);
  assert.match(projectSource, /tasks\.map[\s\S]*?<TaskStatusChip status=\{task\.status\}/);
  assert.doesNotMatch(projectSource, /task\.status\.replace/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --loader @esbuild-kit/esm-loader --test tests/workflow-contract.test.mjs`

Expected: FAIL because project collection rows still contain `.task-check` and duplicate status metadata.

- [ ] **Step 3: Replace the project-row checkbox and metadata status**

Import `TaskStatusChip`, replace the `.task-check` span with `<TaskStatusChip status={task.status} />`, and change the metadata inputs from:

```tsx
[
  task.dueDate ? `Due ${task.dueDate}` : "No due date",
  task.status.replace("_", " "),
]
```

to:

```tsx
[task.dueDate ? `Due ${task.dueDate}` : "No due date"]
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --loader @esbuild-kit/esm-loader --test tests/workflow-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit project workspace integration**

```bash
git add app/components/project-workspace.tsx tests/workflow-contract.test.mjs
git commit -m "feat: standardize project task statuses"
```

---

### Task 4: Align responsive layouts with status chips

**Files:**
- Modify: `app/globals.css`
- Modify: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Consumes: `.status-chip`, `.status-chip-compact`, task row, agenda, calendar, collection, and money-row markup from Tasks 1-3.
- Produces: readable full-text status chips from desktop through mobile widths without checkbox styles.

- [ ] **Step 1: Write failing responsive style tests**

```js
test("responsive task status styles use readable labels instead of checkboxes", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.doesNotMatch(css, /\.task-check/);
  assert.match(css, /\.status-chip-compact/);
  assert.match(css, /\.calendar-item \.status-chip/);
  assert.match(css, /\.agenda-item \.status-chip/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --loader @esbuild-kit/esm-loader --test tests/mobile-contract.test.mjs`

Expected: FAIL because `.task-check` styles remain and compact Timeline chip styles do not exist.

- [ ] **Step 3: Update CSS layouts**

Remove `.task-check` and `.task-check.complete`. Change `.task-row` to four columns: `minmax(160px, 1fr) auto auto 16px`. Add compact and Timeline-specific rules that retain full text:

```css
.status-chip-compact {
  min-height: 20px;
  padding: 1px 5px;
  font-size: 9px;
}

.agenda-item .status-chip {
  justify-self: start;
  align-self: center;
}

.calendar-item .status-chip {
  grid-row: span 2;
  align-self: start;
}
```

Update agenda and calendar grid columns to fit the full chip, and update mobile `.task-row` overrides so the status chip remains visible.

- [ ] **Step 4: Run the focused style test and verify GREEN**

Run: `node --loader @esbuild-kit/esm-loader --test tests/mobile-contract.test.mjs`

Expected: PASS.

- [ ] **Step 5: Run all contract tests touched by the feature**

Run: `node --loader @esbuild-kit/esm-loader --test tests/dashboard-contract.test.mjs tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit responsive integration**

```bash
git add app/globals.css tests/mobile-contract.test.mjs
git commit -m "style: fit task status labels across dashboards"
```

---

### Task 5: Full verification and live visual QA

**Files:**
- Verify: `app/components/task-status-chip.tsx`
- Verify: `app/components/dashboards.tsx`
- Verify: `app/components/project-workspace.tsx`
- Verify: `app/globals.css`
- Verify: `tests/dashboard-contract.test.mjs`
- Verify: `tests/workflow-contract.test.mjs`
- Verify: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Consumes: the completed component and integrations from Tasks 1-4.
- Produces: verification evidence for every explicit design requirement.

- [ ] **Step 1: Run the complete test suite**

Run: `node --loader @esbuild-kit/esm-loader --test tests/*.test.mjs`

Expected: all tests PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit code 0.

- [ ] **Step 3: Build and validate the production artifact**

Run: `npm run build`

Expected: exit code 0 and artifact validation succeeds.

Run: `npm run validate:artifact`

Expected: `Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.`

- [ ] **Step 4: Verify source invariants**

Run: `rg -n "task-check|item\.type === \"task\" \? \"✓\"" app`

Expected: no matches.

Run: `rg -n "TaskStatusChip" app/components`

Expected: matches in the shared component, dashboards, and project workspace.

- [ ] **Step 5: Verify the live UI**

Inspect Overview, Tasks, a project collection, Spending, and Timeline in Agenda, Month, and Week modes. Confirm each task has exactly one visible `To do` or `Done` pill, Timeline shows the correct state, no checkbox/checkmark status remains, events are unchanged, and full status labels remain legible at desktop and narrow widths.

- [ ] **Step 6: Check repository cleanliness**

Run: `git diff --check && git status --short --branch`

Expected: no whitespace errors and only intended committed changes.
