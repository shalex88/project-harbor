# Timeline and Spending Header Actions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove creation controls from Spending and add task creation immediately before event creation in the Timeline desktop header.

**Architecture:** A pure route-action resolver defines primary and secondary creation kinds, `HarborApp` turns those kinds into the existing creation handlers, and `AppShell` renders the resulting optional actions. The primary action remains the sole mobile creation action, preserving Timeline's mobile event-creation behavior while allowing Spending to omit creation entirely.

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

- Create: `app/components/header-actions.ts`
- Create: `tests/header-actions.test.mjs`

**Interfaces:**

- Consumes: route literals from the existing `AppRoute` union.
- Produces: `HeaderActionKind`, `HeaderActions`, and `headerActionsForRoute(route)` with regression coverage for Timeline, Spending, and all unchanged routes.

- [ ] **Step 1: Write the failing behavior tests**

```js
import assert from "node:assert/strict";
import test from "node:test";

const headerActionsModule = await import(
  "../app/components/header-actions.ts"
).catch(() => ({}));
const { headerActionsForRoute } = headerActionsModule;

test("timeline offers task creation before event creation", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(headerActionsForRoute("timeline"), {
    secondary: "task",
    primary: "event",
  });
});

test("spending offers no creation actions", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(headerActionsForRoute("spending"), {});
});

test("other routes preserve their existing primary creation action", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(
    Object.fromEntries(
      ["overview", "tasks", "events", "project"].map((route) => [
        route,
        headerActionsForRoute(route),
      ]),
    ),
    {
      overview: { primary: "project" },
      tasks: { primary: "task" },
      events: { primary: "event" },
      project: { primary: "task" },
    },
  );
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: FAIL with `headerActionsForRoute must exist` because the route-action resolver has not been created.

- [ ] **Step 3: Implement the pure route-action resolver**

Create `app/components/header-actions.ts`:

```ts
import type { AppRoute } from "./app-shell";

export type HeaderActionKind = "project" | "task" | "event";

export type HeaderActions = {
  primary?: HeaderActionKind;
  secondary?: HeaderActionKind;
};

export function headerActionsForRoute(route: AppRoute): HeaderActions {
  if (route === "spending") return {};
  if (route === "timeline") {
    return { secondary: "task", primary: "event" };
  }
  if (route === "tasks" || route === "project") {
    return { primary: "task" };
  }
  if (route === "events") return { primary: "event" };
  return { primary: "project" };
}
```

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: PASS with three tests and zero failures.

- [ ] **Step 5: Commit the resolver and its contract**

```bash
git add app/components/header-actions.ts tests/header-actions.test.mjs
git commit -m "Add dashboard header action rules"
```

### Task 2: Render the approved Timeline and Spending actions

**Files:**

- Modify: `app/components/app-shell.tsx:51-83`
- Modify: `app/components/app-shell.tsx:205-227`
- Modify: `app/components/harbor-app.tsx:393-415`
- Modify: `app/components/harbor-app.tsx:547-562`
- Test: `tests/header-actions.test.mjs`

**Interfaces:**

- Consumes: `headerActionsForRoute(route)`, `HeaderActionKind`, `openCreate(type: "task" | "event")`, and the existing project-route active-collection behavior.
- Produces: optional `primaryAction` and `secondaryAction` props for `AppShell`, an actionless Spending header, and a Timeline desktop header ordered as `+ New task`, then `+ New event`.

- [ ] **Step 1: Make the shared shell actions optional**

Change the `AppShell` props to:

```tsx
primaryAction?: {
  label: string;
  onClick: () => void;
};
secondaryAction?: {
  label: string;
  onClick: () => void;
};
```

Destructure both action props. Render the mobile button only when
`primaryAction` exists. In `.header-actions`, render:

```tsx
{secondaryAction ? (
  <button className="button" type="button" onClick={secondaryAction.onClick}>
    + {secondaryAction.label}
  </button>
) : null}
{primaryAction ? (
  <button className="button button-primary" type="button" onClick={primaryAction.onClick}>
    + {primaryAction.label}
  </button>
) : null}
```

- [ ] **Step 2: Supply route-specific actions from `HarborApp`**

Import `headerActionsForRoute` and `HeaderActionKind`. Replace
`primaryAction` and `actionLabel` with:

```tsx
const headerActions = headerActionsForRoute(route);

const runHeaderAction = (kind: HeaderActionKind) => {
  if (kind === "event") return openCreate("event");
  if (kind === "task") {
    if (route === "project") {
      const collectionId = activeCollectionId ?? activeCollections[0]?.id;
      if (collectionId) {
        setItemMode({ kind: "new", type: "task", collectionId });
        return;
      }
    }
    return openCreate("task");
  }
  setNewProjectOpen(true);
};

const toHeaderAction = (kind: HeaderActionKind | undefined) =>
  kind
    ? {
        label:
          kind === "task"
            ? "New task"
            : kind === "event"
              ? "New event"
              : "New project",
        onClick: () => runHeaderAction(kind),
      }
    : undefined;
```

Pass these action props to `AppShell`:

```tsx
primaryAction={toHeaderAction(headerActions.primary)}
secondaryAction={toHeaderAction(headerActions.secondary)}
```

- [ ] **Step 3: Run the focused test to verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: PASS with three tests and zero failures.

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
