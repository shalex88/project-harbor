# Timeline and Spending Header Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove creation controls from Spending and add task creation immediately before event creation in the Timeline desktop header.

**Architecture:** `HarborApp` continues to select actions by route, while `AppShell` renders optional primary and secondary actions. The primary action remains the sole mobile creation action, preserving Timeline's mobile event-creation behavior while allowing Spending to omit creation entirely.

**Tech Stack:** React 19, TypeScript, Node built-in test runner.

## Global Constraints

- Remove `+ New project` from the Spending workspace header.
- Remove the generic mobile create action from Spending.
- Add `+ New task` immediately left of `+ New event` on Timeline.
- Open the existing new-task form from the new Timeline action.
- Preserve every other route's header actions and creation behavior.
- Do not add a new modal, mutation, or dashboard-local header.
- Work in the current checkout on a feature branch; do not create a worktree.

---

### Task 1: Establish the route-specific header action contract

**Files:**

- Create: `tests/header-actions.test.mjs`

**Interfaces:**

- Consumes: source text from `app/components/app-shell.tsx` and `app/components/harbor-app.tsx`.
- Produces: regression coverage for optional shared-shell actions, approved desktop ordering, Timeline task/event wiring, and Spending action removal.

- [ ] **Step 1: Write the failing contract tests**

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const appShellSource = await readFile(
  new URL("../app/components/app-shell.tsx", import.meta.url),
  "utf8",
);
const harborAppSource = await readFile(
  new URL("../app/components/harbor-app.tsx", import.meta.url),
  "utf8",
);

test("shared shell renders optional secondary and primary desktop actions in order", () => {
  assert.match(appShellSource, /actionLabel\?: string;/);
  assert.match(appShellSource, /secondaryActionLabel\?: string;/);
  assert.match(appShellSource, /onPrimaryAction\?: \(\) => void;/);
  assert.match(appShellSource, /onSecondaryAction\?: \(\) => void;/);

  const header = appShellSource.slice(
    appShellSource.indexOf('<header className="workspace-header">'),
    appShellSource.indexOf('<main className="workspace-main">'),
  );
  assert.ok(
    header.indexOf("secondaryActionLabel") < header.indexOf("actionLabel"),
    "secondary action must render before the primary action",
  );
  assert.match(
    appShellSource,
    /actionLabel && onPrimaryAction[\s\S]*?className="button button-primary mobile-create"/,
  );
});

test("timeline supplies task and event actions while spending supplies none", () => {
  assert.match(harborAppSource, /const hasPrimaryAction = route !== "spending";/);
  assert.match(
    harborAppSource,
    /secondaryActionLabel=\{route === "timeline" \? "New task" : undefined\}/,
  );
  assert.match(
    harborAppSource,
    /onSecondaryAction=\{route === "timeline" \? \(\) => openCreate\("task"\) : undefined\}/,
  );
  assert.match(
    harborAppSource,
    /actionLabel=\{hasPrimaryAction \? actionLabel : undefined\}/,
  );
  assert.match(
    harborAppSource,
    /onPrimaryAction=\{hasPrimaryAction \? primaryAction : undefined\}/,
  );
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: FAIL because `AppShell` requires one primary action, exposes no secondary action, and `HarborApp` does not suppress Spending or wire Timeline task creation.

- [ ] **Step 3: Commit the failing contract**

```bash
git add tests/header-actions.test.mjs
git commit -m "Test dashboard header actions"
```

### Task 2: Render the approved Timeline and Spending actions

**Files:**

- Modify: `app/components/app-shell.tsx:51-83`
- Modify: `app/components/app-shell.tsx:205-227`
- Modify: `app/components/harbor-app.tsx:393-415`
- Modify: `app/components/harbor-app.tsx:547-562`
- Test: `tests/header-actions.test.mjs`

**Interfaces:**

- Consumes: `openCreate(type: "task" | "event")`, the existing `primaryAction`, and optional `actionLabel`, `secondaryActionLabel`, `onPrimaryAction`, and `onSecondaryAction` props.
- Produces: an actionless Spending header and a Timeline desktop header ordered as `+ New task`, then `+ New event`.

- [ ] **Step 1: Make the shared shell actions optional**

Change the `AppShell` props to:

```tsx
actionLabel?: string;
secondaryActionLabel?: string;
onPrimaryAction?: () => void;
onSecondaryAction?: () => void;
```

Destructure both secondary action props. Render the mobile button only when
`actionLabel && onPrimaryAction`. In `.header-actions`, render:

```tsx
{secondaryActionLabel && onSecondaryAction ? (
  <button className="button" type="button" onClick={onSecondaryAction}>
    + {secondaryActionLabel}
  </button>
) : null}
{actionLabel && onPrimaryAction ? (
  <button className="button button-primary" type="button" onClick={onPrimaryAction}>
    + {actionLabel}
  </button>
) : null}
```

- [ ] **Step 2: Supply route-specific actions from `HarborApp`**

After `actionLabel`, add:

```tsx
const hasPrimaryAction = route !== "spending";
```

Pass these action props to `AppShell`:

```tsx
actionLabel={hasPrimaryAction ? actionLabel : undefined}
secondaryActionLabel={route === "timeline" ? "New task" : undefined}
onSecondaryAction={route === "timeline" ? () => openCreate("task") : undefined}
onPrimaryAction={hasPrimaryAction ? primaryAction : undefined}
```

- [ ] **Step 3: Run the focused test to verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: PASS with two tests and zero failures.

- [ ] **Step 4: Commit the implementation**

```bash
git add app/components/app-shell.tsx app/components/harbor-app.tsx
git commit -m "Update dashboard header actions"
```

### Task 3: Verify behavior and publish

**Files:**

- Inspect: `app/components/app-shell.tsx`
- Inspect: `app/components/harbor-app.tsx`
- Inspect: Timeline and Spending in the running browser.

**Interfaces:**

- Consumes: repository scripts in `package.json` and the local application at `http://localhost:5173`.
- Produces: fresh automated and rendered evidence for every requirement.

- [ ] **Step 1: Run complete automated verification**

Run:

```bash
npm test
npm run lint
npm run validate:artifact
```

Expected: all commands exit 0 with no test failures or lint errors.

- [ ] **Step 2: Inspect Timeline in the browser**

Open `/timeline` at desktop width. Confirm `+ New task` is immediately left of
`+ New event`, clicking it opens the existing task form, and clicking
`+ New event` still opens the event form.

- [ ] **Step 3: Inspect Spending in the browser**

Open `/spending` at desktop width and a narrow mobile width. Confirm neither
header shows a project/create action.

- [ ] **Step 4: Confirm the branch scope**

Run:

```bash
git status --short --branch
git diff --check origin/main...HEAD
git log --oneline origin/main..HEAD
```

Expected: only the design, plan, test, and implementation changes are present.

- [ ] **Step 5: Push and open a draft pull request**

Push the current branch to `origin`, then open a draft pull request targeting
the repository's default branch. Include the behavior change and all validation
commands in the pull request body.
