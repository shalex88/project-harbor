# Two-State Task Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `In progress` with a two-state `To do`/`Done` workflow and split the Tasks dashboard into side-by-side status panels.

**Architecture:** The domain and database accept only `todo` and `done`, with a forward migration mapping legacy `in_progress` rows to `todo` before enforcing the new constraint. Dashboard filters first produce the eligible task set, then the Tasks dashboard partitions that set by status and renders each partition in the existing responsive two-column panel layout.

**Tech Stack:** TypeScript 5.9, React 19, Vite/vinext, Drizzle ORM, Cloudflare D1/SQLite, Node test runner, ESLint.

## Global Constraints

- Persisted task statuses are exactly `todo` and `done`.
- Existing `in_progress` records migrate to `todo`.
- The Tasks dashboard renders `To do` on the left and `Done` on the right.
- Project, collection, and due-date filters apply to both task panels.
- Task creation/editing and global status filters never offer `In progress`.
- `open` and `all` may remain aggregate filter modes but are not persisted statuses.

---

## File Structure

- `lib/domain.ts`: owns the `TaskStatus` union and runtime status validation.
- `lib/repository.ts`: owns preview schema creation, development seed values, and typed database row hydration.
- `db/schema.ts`: owns the Drizzle representation of the two-state database constraint.
- `drizzle/0002_*.sql` and `drizzle/meta/*`: own the forward D1 migration and Drizzle migration metadata.
- `app/components/dashboards.tsx`: owns task status labels, filters, partitioning, and the Tasks dashboard panels.
- `app/components/item-sheet.tsx`: owns task creation/editing status input and mutation typing.
- `app/globals.css`: owns status chip styles; the removed state style is deleted.
- `tests/domain.test.mjs`: exercises runtime status validation.
- `tests/schema-contract.test.mjs`: checks migration order and the new persisted constraint.
- `tests/dashboard-contract.test.mjs`: checks Tasks dashboard structure and removed controls.
- `tests/repository-contract.test.mjs`: checks preview schema and seed compatibility.

### Task 1: Narrow the Domain and Repository to Two States

**Files:**
- Modify: `tests/domain.test.mjs`
- Modify: `tests/repository-contract.test.mjs`
- Modify: `lib/domain.ts`
- Modify: `lib/repository.ts`

**Interfaces:**
- Produces: `TaskStatus = "todo" | "done"` and `validateTaskStatus(value: unknown): TaskStatus`.
- Consumes: Existing `DomainError` validation behavior and workspace snapshot hydration.

- [ ] **Step 1: Write failing domain and repository tests**

Change the task-status test in `tests/domain.test.mjs` to:

```js
test("task status accepts only todo and done", () => {
  assert.equal(validateTaskStatus("todo"), "todo");
  assert.equal(validateTaskStatus("done"), "done");
  assert.throws(() => validateTaskStatus("in_progress"), /invalid task status/);
  assert.throws(() => validateTaskStatus("review"), /invalid task status/);
});
```

Change the timeline fixture status from `in_progress` to `todo`. Add this contract to `tests/repository-contract.test.mjs`:

```js
test("preview persistence and seed data use only todo and done task states", () => {
  assert.match(repository, /status IN \('todo','done'\)/);
  assert.doesNotMatch(repository, /status IN \('todo','in_progress','done'\)/);
  assert.doesNotMatch(repository, /^\s+"in_progress",$/m);
  assert.doesNotMatch(repository, /"todo" \| "in_progress" \| "done"/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/repository-contract.test.mjs`

Expected: FAIL because `validateTaskStatus("in_progress")` still succeeds and the repository still contains the three-state constraint, seed, and row type.

- [ ] **Step 3: Implement the two-state domain and repository**

In `lib/domain.ts`, use:

```ts
export type TaskStatus = "todo" | "done";

export function validateTaskStatus(value: unknown): TaskStatus {
  if (value === "todo" || value === "done") return value;
  throw new DomainError("invalid task status");
}
```

In `lib/repository.ts`, change the preview constraint to `status IN ('todo','done')`, change the `task-onboarding` seed status to `todo`, and change the database row type to `status: "todo" | "done" | null`.

- [ ] **Step 4: Run the focused tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/repository-contract.test.mjs`

Expected: all tests pass with zero failures.

- [ ] **Step 5: Commit the domain change**

```bash
git add lib/domain.ts lib/repository.ts tests/domain.test.mjs tests/repository-contract.test.mjs
git commit -m "feat: reduce tasks to two statuses"
```

### Task 2: Migrate Persisted Status Data and Constraints

**Files:**
- Modify: `tests/schema-contract.test.mjs`
- Modify: `db/schema.ts`
- Create: `drizzle/0002_*.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0002_snapshot.json`

**Interfaces:**
- Consumes: `TaskStatus = "todo" | "done"` from Task 1.
- Produces: A D1 migration that maps legacy values before enforcing `CHECK(status IS NULL OR status IN ('todo', 'done'))`.

- [ ] **Step 1: Write a failing migration contract test**

Refactor the migration loader in `tests/schema-contract.test.mjs` to retain individual sources:

```js
const migrationSources = await Promise.all(
  migrationFiles.map((file) => readFile(new URL(file, drizzle), "utf8")),
);
const migration = migrationSources.join("\n");
```

Add:

```js
test("task status migration maps in-progress rows before enforcing two states", () => {
  const twoStateMigration = migrationSources.find((source) =>
    /UPDATE work_items SET status = 'todo' WHERE status = 'in_progress'/.test(source),
  ) ?? "";
  const updateIndex = twoStateMigration.indexOf(
    "UPDATE work_items SET status = 'todo' WHERE status = 'in_progress'",
  );
  const constraintIndex = twoStateMigration.indexOf("IN ('todo', 'done')");
  assert.ok(updateIndex >= 0, "migration must normalize in-progress tasks");
  assert.ok(constraintIndex > updateIndex, "normalization must precede the new constraint");
});
```

- [ ] **Step 2: Run the schema test and verify RED**

Run: `node --test tests/schema-contract.test.mjs`

Expected: FAIL with `migration must normalize in-progress tasks`.

- [ ] **Step 3: Narrow the Drizzle schema and generate the migration**

Change `work_items_status_check` in `db/schema.ts` to:

```ts
check(
  "work_items_status_check",
  sql`${table.status} IS NULL OR ${table.status} IN ('todo', 'done')`,
),
```

Run: `npm run db:generate`

Expected: Drizzle creates migration index `0002` plus updated journal and snapshot metadata.

- [ ] **Step 4: Normalize legacy rows before the generated table reconstruction**

At the start of generated `drizzle/0002_*.sql`, before the temporary table with the two-state constraint is created, add:

```sql
UPDATE work_items SET status = 'todo' WHERE status = 'in_progress';
--> statement-breakpoint
```

Keep all generated indexes, foreign keys, and unrelated work-item constraints intact.

- [ ] **Step 5: Run schema and generation checks and verify GREEN**

Run: `node --test tests/schema-contract.test.mjs`, then `npm run db:generate`, then `git diff --check`.

Expected: schema tests pass; the second generation reports no schema changes; diff check exits zero.

- [ ] **Step 6: Commit the persistence migration**

```bash
git add db/schema.ts drizzle tests/schema-contract.test.mjs
git commit -m "feat: migrate tasks to two-state persistence"
```

### Task 3: Split the Tasks Dashboard and Remove Legacy UI Controls

**Files:**
- Modify: `tests/dashboard-contract.test.mjs`
- Modify: `app/components/dashboards.tsx`
- Modify: `app/components/item-sheet.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `TaskRecord["status"]` containing only `todo` or `done`.
- Produces: A Tasks dashboard with independent `To do` and `Done` panels and two-state status controls everywhere.

- [ ] **Step 1: Write failing dashboard contracts**

Load `item-sheet.tsx` and `globals.css` beside the dashboard source, then add:

```js
test("tasks dashboard separates to-do and done tasks into two panels", () => {
  const tasksDashboard = source.slice(
    source.indexOf("export function TasksDashboard"),
    source.indexOf("export function EventsDashboard"),
  );
  assert.match(tasksDashboard, /className="two-column-panels"/);
  assert.match(tasksDashboard, /title="To do"/);
  assert.match(tasksDashboard, /title="Done"/);
  assert.match(tasksDashboard, /item\.status === "todo"/);
  assert.match(tasksDashboard, /item\.status === "done"/);
  assert.doesNotMatch(tasksDashboard, /Filter by status/);
});

test("task controls expose no in-progress option or styling", () => {
  assert.doesNotMatch(source, />In progress</);
  assert.doesNotMatch(itemSheetSource, />In progress</);
  assert.doesNotMatch(itemSheetSource, /"todo" \| "in_progress" \| "done"/);
  assert.doesNotMatch(styles, /\.status-in_progress/);
});
```

- [ ] **Step 2: Run the dashboard contract and verify RED**

Run: `node --test tests/dashboard-contract.test.mjs`

Expected: FAIL because Tasks still has one panel and the legacy option/style still exists.

- [ ] **Step 3: Implement two-state controls and dashboard partitioning**

In `app/components/dashboards.tsx`, simplify `statusLabel`, remove every `in_progress` option, remove the Tasks dashboard status URL filter/select/filter branches/Clear reset, and partition the remaining filtered tasks:

```ts
const todoTasks = tasks.filter((item) => item.status === "todo");
const doneTasks = tasks.filter((item) => item.status === "done");
```

Replace the single panel with:

```tsx
<div className="two-column-panels">
  <Panel title="To do" count={todoTasks.length}>
    <div className="row-list">
      {todoTasks.map((item) => <TaskRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />)}
      {!todoTasks.length ? <EmptyState title="No to-do tasks" description="Tasks ready for action will appear here." /> : null}
    </div>
  </Panel>
  <Panel title="Done" count={doneTasks.length}>
    <div className="row-list">
      {doneTasks.map((item) => <TaskRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />)}
      {!doneTasks.length ? <EmptyState title="No completed tasks" description="Completed tasks will appear here." /> : null}
    </div>
  </Panel>
</div>
```

In `app/components/item-sheet.tsx`, type submitted task status as `"todo" | "done"` and remove the legacy option. In `app/globals.css`, delete `.status-in_progress`.

- [ ] **Step 4: Run dashboard and build checks and verify GREEN**

Run: `node --test tests/dashboard-contract.test.mjs`, then `npm run build`.

Expected: dashboard contract passes and the production build exits zero.

- [ ] **Step 5: Commit the UI change**

```bash
git add app/components/dashboards.tsx app/components/item-sheet.tsx app/globals.css tests/dashboard-contract.test.mjs
git commit -m "feat: split tasks into to-do and done panels"
```

### Task 4: Full Verification and Runtime QA

**Files:**
- Verify only; modify implementation or tests only if verification reveals a defect.

**Interfaces:**
- Consumes: The complete two-state workflow from Tasks 1–3.
- Produces: Fresh evidence for domain, persistence, UI, responsive layout, and repository cleanliness.

- [ ] **Step 1: Run the full automated verification suite**

Run: `npm test`, `npm run lint`, `npm run validate:artifact`, and `git diff --check`.

Expected: all commands exit zero with no test failures or lint errors.

- [ ] **Step 2: Audit remaining legacy references**

Run:

```bash
rg -n "in_progress|In progress|status-in_progress" app db lib worker tests drizzle --glob '!drizzle/0000_tired_squirrel_girl.sql' --glob '!drizzle/meta/0000_snapshot.json'
```

Expected: remaining references are limited to the forward migration update and tests proving rejection/migration; no application, current schema, repository, or UI reference remains.

- [ ] **Step 3: Inspect the running Tasks page**

Open `http://localhost:5173/tasks` at desktop width and verify the left `To do` and right `Done` panels, accurate counts, migrated task placement, absence of `In progress`, and filters affecting both panels. Inspect a narrow viewport and confirm the established responsive rule stacks the panels without clipping rows.

- [ ] **Step 4: Review final repository state**

Run:

```bash
git status --short
git log -5 --oneline
```

Expected: only intentional plan/implementation changes exist and the implementation commits are present.
