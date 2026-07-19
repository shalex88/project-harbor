# Dashboard Attachment Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a paperclip physically to the left of every task or event title across Project Harbor dashboards whenever that work item has attached files.

**Architecture:** Add one focused `WorkItemTitle` component that owns conditional attachment rendering, accessible labeling, and title direction markup. Replace direct work-item title rendering in global dashboards and project collection lists, then add shared CSS that preserves physical-left placement for both LTR and RTL titles.

**Tech Stack:** React 19, TypeScript, Next.js/Vinext, CSS, Node.js test runner

## Global Constraints

- Render a paperclip only when `item.files.length > 0`.
- Do not render an attachment count or reserve space for items without files.
- Keep the paperclip physically left of English, Hebrew, and other RTL titles.
- Cover Overview, Tasks, Events, Timeline agenda/month/week, Spending work-item rows, and project collection task/event lists.
- Do not change APIs, persistence, schemas, payment-history entries, or file-management lists.
- Preserve responsive wrapping, existing touch targets, and the accessible label `Has attached files`.

---

### Task 1: Shared work-item title and dashboard integration

**Files:**
- Create: `app/components/work-item-title.tsx`
- Modify: `app/components/dashboards.tsx`
- Modify: `app/components/project-workspace.tsx`
- Create: `tests/attachment-indicator-contract.test.mjs`

**Interfaces:**
- Consumes: `Pick<WorkItemRecord, "title" | "files">`
- Produces: `WorkItemTitle({ item }): React.JSX.Element`, rendering the item title plus an optional paperclip

- [ ] **Step 1: Write the failing integration contract**

Create `tests/attachment-indicator-contract.test.mjs` with source-level contracts matching the project’s existing dashboard tests:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const titleSource = await readFile(new URL("app/components/work-item-title.tsx", root), "utf8").catch(() => "");
const dashboardSource = await readFile(new URL("app/components/dashboards.tsx", root), "utf8").catch(() => "");
const projectSource = await readFile(new URL("app/components/project-workspace.tsx", root), "utf8").catch(() => "");

test("work item titles show an accessible paperclip only for attached files", () => {
  assert.match(titleSource, /item\.files\.length\s*>\s*0/);
  assert.match(titleSource, /Has attached files/);
  assert.match(titleSource, /📎/);
  assert.doesNotMatch(titleSource, /files\.length\s*\}/);
});

test("every global dashboard work-item title uses the shared indicator", () => {
  assert.match(dashboardSource, /function TaskRow[\s\S]*?<WorkItemTitle item=\{item\}/);
  assert.match(dashboardSource, /function EventRow[\s\S]*?<WorkItemTitle item=\{item\}/);
  assert.match(dashboardSource, /agenda-item[\s\S]*?<WorkItemTitle item=\{item\}/);
  assert.match(dashboardSource, /calendar-item[\s\S]*?<WorkItemTitle item=\{item\}/);
  assert.match(dashboardSource, /money-row[\s\S]*?<WorkItemTitle item=\{item\}/);
});

test("project collection task and event titles use the shared indicator", () => {
  assert.match(projectSource, /tasks\.map[\s\S]*?<WorkItemTitle item=\{task\}/);
  assert.match(projectSource, /events\.map[\s\S]*?<WorkItemTitle item=\{event\}/);
});
```

- [ ] **Step 2: Run the contract and verify RED**

Run:

```bash
node --test tests/attachment-indicator-contract.test.mjs
```

Expected: FAIL because `work-item-title.tsx` does not exist and none of the required shared-component usages or styles exist.

- [ ] **Step 3: Add the minimal shared component**

Create `app/components/work-item-title.tsx`:

```tsx
import type { WorkItemRecord } from "@/lib/domain";

export function WorkItemTitle({
  item,
}: {
  item: Pick<WorkItemRecord, "title" | "files">;
}) {
  return (
    <strong className="work-item-title">
      {item.files.length > 0 ? (
        <span className="attachment-indicator">
          <span className="sr-only">Has attached files</span>
          <span aria-hidden="true">📎</span>
        </span>
      ) : null}
      <span className="work-item-title-text" dir="auto">
        {item.title}
      </span>
    </strong>
  );
}
```

- [ ] **Step 4: Integrate the component into every scoped work-item surface**

Import `WorkItemTitle` in both dashboard files:

```tsx
import { WorkItemTitle } from "./work-item-title";
```

In `TaskRow`, `EventRow`, timeline agenda entries, calendar entries, and the Spending `money-row`, replace each direct title:

```tsx
<strong>{item.title}</strong>
```

with:

```tsx
<WorkItemTitle item={item} />
```

In `project-workspace.tsx`, replace collection task and event titles with:

```tsx
<WorkItemTitle item={task} />
<WorkItemTitle item={event} />
```

Do not change the Recent payments feed because its leading text may be a payment note rather than a work-item title.

- [ ] **Step 5: Run the focused contract**

Run:

```bash
node --test tests/attachment-indicator-contract.test.mjs
```

Expected: 3 tests pass, 0 fail.

- [ ] **Step 6: Commit the rendering work**

```bash
git add app/components/work-item-title.tsx app/components/dashboards.tsx app/components/project-workspace.tsx tests/attachment-indicator-contract.test.mjs
git commit -m "feat: show dashboard attachment indicators"
```

### Task 2: Physical-left responsive layout

**Files:**
- Modify: `app/globals.css`
- Create: `tests/attachment-layout-contract.test.mjs`

**Interfaces:**
- Consumes: `.work-item-title`, `.attachment-indicator`, and `.work-item-title-text` markup from Task 1
- Produces: consistent compact title layout with a physical-left paperclip and automatic title text direction

- [ ] **Step 1: Write and verify the failing layout contract**

Create `tests/attachment-layout-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const titleSource = await readFile(new URL("app/components/work-item-title.tsx", root), "utf8");
const css = await readFile(new URL("app/globals.css", root), "utf8");

test("attachment title layout keeps the icon physically left and the text direction automatic", () => {
  assert.match(titleSource, /className="work-item-title-text" dir="auto"/);
  assert.match(css, /strong\.work-item-title\s*\{[\s\S]*?direction:\s*ltr/);
  assert.match(css, /\.attachment-indicator\s*\{[\s\S]*?color:\s*var\(--text-muted\)/);
  assert.match(css, /\.calendar-item \.work-item-title-text[\s\S]*?white-space:\s*normal/);
});
```

Run:

```bash
node --test tests/attachment-layout-contract.test.mjs
```

Expected: FAIL because the shared layout styles do not exist.

- [ ] **Step 2: Add the shared title and indicator styles**

After the existing `.row-title strong` rules in `app/globals.css`, add:

```css
strong.work-item-title {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  align-items: baseline;
  gap: 5px;
  direction: ltr;
  vertical-align: bottom;
}

.work-item-title-text {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attachment-indicator {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 0.85em;
  line-height: 1;
}
```

Add wrapping overrides alongside the existing responsive metadata rules:

```css
.agenda-item .work-item-title-text,
.calendar-item .work-item-title-text {
  overflow-wrap: anywhere;
  text-overflow: clip;
  white-space: normal;
}
```

Update past-agenda selectors from direct `> strong` assumptions to target `.work-item-title`, preserving the existing muted treatment.

- [ ] **Step 3: Run the focused contracts and verify GREEN**

Run:

```bash
node --test tests/attachment-indicator-contract.test.mjs tests/attachment-layout-contract.test.mjs
```

Expected: 4 tests pass, 0 fail.

- [ ] **Step 4: Run the full suite and production build**

Run:

```bash
npm test
```

Expected: all project tests pass and the Vinext production artifact validator succeeds.

- [ ] **Step 5: Commit the layout work**

```bash
git add app/globals.css tests/attachment-layout-contract.test.mjs
git commit -m "style: place attachment indicators before titles"
```

### Task 3: Publish and verify the exact implementation

**Files:**
- Verify: `.openai/hosting.json`
- Verify: `dist/server/index.js`

**Interfaces:**
- Consumes: the validated branch-head commit and production artifact
- Produces: a successful private Project Harbor production deployment

- [ ] **Step 1: Verify the final source state**

Run:

```bash
git diff --check
git status --short --branch
git rev-parse HEAD
```

Expected: no uncommitted source changes, no whitespace errors, and one exact branch-head SHA.

- [ ] **Step 2: Push `main` to GitHub and the Sites source repository**

Push the current `main` revision to `origin/main`. Obtain a short-lived Sites source credential, use it only as a per-command HTTP authorization header, and push the same SHA to the configured Sites source branch.

- [ ] **Step 3: Package and save the version**

Use the Sites `package-site.sh` helper to package `dist/`, `.openai/hosting.json`, and Drizzle migrations. Save one Sites version using the exact branch-head SHA and archive.

- [ ] **Step 4: Deploy privately and poll to a terminal state**

Deploy the saved version with owner-only access. Poll deployment status until it reports `succeeded` or `failed`; on success, retain the production URL.

- [ ] **Step 5: Perform the completion audit**

Freshly verify that `HEAD`, `origin/main`, the saved Sites version source SHA, and the successful deployment all match. Re-run `npm test` and confirm the attachment contract covers every scoped work-item surface.
