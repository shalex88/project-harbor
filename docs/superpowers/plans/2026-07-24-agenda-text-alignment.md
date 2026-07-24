# Agenda Text Alignment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each agenda task or event title and its metadata align inside one direction-aware content column.

**Architecture:** Keep the agenda row's two-column grid. Wrap `WorkItemTitle` and metadata in an `agenda-item-content` element in the text column; `dir="auto"` lets its two lines use matching bidirectional layout.

**Tech Stack:** React 19, TypeScript, CSS Grid, Node built-in test runner.

## Global Constraints

- Update agenda-mode markup and styles only.
- Preserve status chips, event labels, attachment indicators, item opening, filters, and calendar views.
- Cover the structural contract with the existing source-level suite.

---

### Task 1: Establish the shared agenda content contract

**Files:**

- Modify: `tests/dashboard-contract.test.mjs`

**Interfaces:**

- Consumes: `TimelineDashboard` source and `app/globals.css`.
- Produces: a test requiring `agenda-item-content`, `dir="auto"`, and a two-line CSS grid.

- [ ] **Step 1: Write the failing test**

```js
test("agenda rows group title and metadata in a direction-aware content column", () => {
  const timeline = source.slice(source.indexOf("export function TimelineDashboard"), source.indexOf("export function SpendingDashboard"));
  assert.match(timeline, /className="agenda-item-content" dir="auto"[\s\S]*?<WorkItemTitle item=\{item\} \/>[\s\S]*?<small>/);
  assert.match(styles, /\.agenda-item-content\s*\{[\s\S]*?display:\s*grid;[\s\S]*?grid-template-rows:\s*auto\s+auto;/);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run `node --experimental-strip-types --test tests/dashboard-contract.test.mjs`; expect failure because the wrapper is absent.

- [ ] **Step 3: Commit the test**

Run `git add tests/dashboard-contract.test.mjs && git commit -m "test: cover agenda text alignment"`.

### Task 2: Group agenda text in the shared content column

**Files:**

- Modify: `app/components/dashboards.tsx:611-631`
- Modify: `app/globals.css:1095-1135`

**Interfaces:**

- Consumes: `WorkItemTitle`, `workItemMetadata`, and the leading status/event child in each agenda row.
- Produces: `.agenda-item-content` with the title and metadata stacked in its shared text column.

- [ ] **Step 1: Write the minimal implementation**

```tsx
<span className="agenda-item-content" dir="auto">
  <WorkItemTitle item={item} />
  <small>{workItemMetadata(/* existing arguments */)}</small>
</span>
```

```css
.agenda-item-content {
  display: grid;
  min-width: 0;
  grid-template-rows: auto auto;
  gap: 4px;
  text-align: start;
}
```

- [ ] **Step 2: Verify the focused test passes**

Run `node --experimental-strip-types --test tests/dashboard-contract.test.mjs`; expect zero failures.

- [ ] **Step 3: Commit implementation**

Run `git add app/components/dashboards.tsx app/globals.css && git commit -m "fix: align agenda item text"`.

### Task 3: Verify the complete change

**Files:**

- Inspect: `app/components/dashboards.tsx`
- Inspect: `app/globals.css`

**Interfaces:**

- Consumes: build and test configuration from `package.json`.
- Produces: evidence of valid build, tests, lint, and desktop agenda alignment.

- [ ] **Step 1: Run full verification**

Run `npm test && npm run lint`; expect both exit 0.

- [ ] **Step 2: Inspect the desktop agenda**

Start the application and inspect `/timeline?view=agenda`. Confirm tasks/events retain leading labels and title/metadata share an inline start.

- [ ] **Step 3: Confirm branch commits**

Run `git status --short --branch && git log --oneline origin/main..HEAD`; expect a clean branch with design, test, and implementation commits.
