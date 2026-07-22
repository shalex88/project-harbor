# Project Menu Rename and Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give project owners rename and delete actions in every project context menu while members retain export-only access.

**Architecture:** `ProjectMenu` remains responsible for accessible menu interaction and emits action callbacks. `AppShell` owns one shared rename/delete dialog state for both desktop and mobile menus. `HarborApp` adapts those callbacks to existing workspace mutations and uses a small pure routing helper to leave a project URL after deleting the currently open project.

**Tech Stack:** React 19, TypeScript 5.9, Node test runner, CSS, existing Project Harbor workspace API.

## Global Constraints

- Rename and delete are visible only when `project.role === "owner"`.
- Members continue to see only `Export project`.
- Rename preserves description and currency and uses `update_project`.
- Delete uses `delete_project` and always requires confirmation.
- Failed mutations keep their dialogs open and use the existing error toast.
- Deleting the currently open project replaces its URL with `/` and shows Overview; other routes remain unchanged.
- Preserve existing project-menu portal placement, roles, focus, arrow keys, Escape, outside-click dismissal, and export behavior.
- Add no API actions, schema changes, dependencies, soft-delete, archive, or restore behavior.

---

### Task 1: Owner-only project menu actions

**Files:**
- Modify: `tests/project-transfer-ui.test.mjs`
- Modify: `app/components/project-menu.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `ProjectRecord.role`, existing `onExport(projectId: string): Promise<void>`.
- Produces: `onRename(project: ProjectRecord): void` and `onDelete(project: ProjectRecord): void` props on `ProjectMenu`.

- [ ] **Step 1: Write the failing menu contract test**

Add a test that requires owner gating, the two labels, callback invocations after `close()`, and the danger class:

```js
test("owner project menus expose rename and delete actions", () => {
  assert.match(menu, /project\.role === "owner"/);
  assert.match(menu, /Rename project/);
  assert.match(menu, /Delete project/);
  assert.match(menu, /onRename\(project\)/);
  assert.match(menu, /onDelete\(project\)/);
  assert.match(menu, /className="project-menu-danger"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test tests/project-transfer-ui.test.mjs`

Expected: FAIL because `ProjectMenu` has no rename/delete labels or callbacks.

- [ ] **Step 3: Implement the minimal menu actions**

Extend `ProjectMenu` props with synchronous action-open callbacks. Within the menu, wrap `Rename project` and `Delete project` buttons in `project.role === "owner"`; call `close()` and then the corresponding callback. Keep Export between them and apply `className="project-menu-danger"` only to delete.

Add this CSS after the standard menu hover rule:

```css
.project-context-menu .project-menu-danger {
  color: #fecdd3;
}

.project-context-menu .project-menu-danger:hover,
.project-context-menu .project-menu-danger:focus-visible {
  background: rgba(251, 113, 133, 0.12);
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --experimental-strip-types --test tests/project-transfer-ui.test.mjs`

Expected: all project-transfer UI tests pass.

### Task 2: Shared rename and delete dialogs

**Files:**
- Modify: `tests/project-transfer-ui.test.mjs`
- Modify: `app/components/app-shell.tsx`

**Interfaces:**
- Consumes: Task 1 `ProjectMenu` callbacks.
- Produces: `onProjectRename(projectId: string, name: string): Promise<void>`, `onProjectDelete(projectId: string): Promise<void>`, and `projectMutationPending: boolean` props on `AppShell`.

- [ ] **Step 1: Write the failing shell contract test**

Require one `ProjectActionDialog` state, both callbacks on desktop and mobile menu instances, owner action modals, name validation, and mobile sheet closure:

```js
test("the shell coordinates shared project rename and delete dialogs", () => {
  assert.match(shell, /type ProjectActionDialog/);
  assert.match(shell, /onProjectRename/);
  assert.match(shell, /onProjectDelete/);
  assert.match(shell, /setMobileMoreOpen\(false\)/);
  assert.match(shell, /title="Rename project"/);
  assert.match(shell, /name="name"[\s\S]*required[\s\S]*maxLength=\{120\}/);
  assert.match(shell, /title="Delete project"/);
  assert.match(shell, /className="button button-danger"/);
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `node --experimental-strip-types --test tests/project-transfer-ui.test.mjs`

Expected: FAIL because the shell exposes no project action dialogs.

- [ ] **Step 3: Implement shared dialog state and handlers**

Import `FormEvent` plus `Field`, `FormActions`, `Modal`, and `SubmitForm`. Add:

```ts
type ProjectActionDialog =
  | { kind: "rename"; project: ProjectRecord }
  | { kind: "delete"; project: ProjectRecord }
  | null;
```

Store it once in `AppShell`. Pass action callbacks to both menu locations; each callback closes the mobile More sheet before setting dialog state. The rename submit reads `name`, awaits `onProjectRename`, and closes only on success. The delete confirmation awaits `onProjectDelete` and closes only on success. Catch callback rejection locally because `HarborApp.mutate` already displays the error toast.

Render a small rename `Modal` with a required `maxLength={120}` name input and `FormActions`. Render a small delete `Modal` naming the project, with Cancel and a pending-aware danger button.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `node --experimental-strip-types --test tests/project-transfer-ui.test.mjs`

Expected: all project-transfer UI tests pass.

### Task 3: Existing mutations and active-project route cleanup

**Files:**
- Create: `app/components/project-delete-navigation.ts`
- Create: `tests/project-delete-navigation.test.mjs`
- Modify: `tests/project-transfer-ui.test.mjs`
- Modify: `app/components/harbor-app.tsx`

**Interfaces:**
- Consumes: Task 2 `AppShell` callback props and existing `mutate(mutation)`.
- Produces: `shouldLeaveDeletedProjectRoute(route: AppRoute, activeProjectId: string | null, deletedProjectId: string): boolean`.

- [ ] **Step 1: Write failing routing unit tests**

Create tests that expect `true` only when route is `project` and both IDs match, and `false` for dashboard routes, a different active project, or no active project.

```js
assert.equal(shouldLeaveDeletedProjectRoute("project", "p1", "p1"), true);
assert.equal(shouldLeaveDeletedProjectRoute("spending", "p1", "p1"), false);
assert.equal(shouldLeaveDeletedProjectRoute("project", "p2", "p1"), false);
assert.equal(shouldLeaveDeletedProjectRoute("project", null, "p1"), false);
```

Extend the UI contract to require `update_project`, preserved `project.description`, `delete_project`, `shouldLeaveDeletedProjectRoute`, and `window.history.replaceState({}, "", "/")`.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/project-delete-navigation.test.mjs tests/project-transfer-ui.test.mjs`

Expected: FAIL because the helper file and shell callback wiring do not exist.

- [ ] **Step 3: Implement the routing helper and mutation adapters**

Implement the pure helper exactly as:

```ts
import type { AppRoute } from "./app-shell";

export function shouldLeaveDeletedProjectRoute(
  route: AppRoute,
  activeProjectId: string | null,
  deletedProjectId: string,
): boolean {
  return route === "project" && activeProjectId === deletedProjectId;
}
```

In `HarborApp`, rename looks up the current project and calls:

```ts
await mutate({
  action: "update_project",
  projectId,
  name,
  description: project.description,
});
```

Delete computes whether to leave before mutation, awaits `delete_project`, then sets `route` to `overview` and calls `history.replaceState({}, "", "/")` only when the helper returned true. Pass both handlers and `pending` to `AppShell`.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/project-delete-navigation.test.mjs tests/project-transfer-ui.test.mjs`

Expected: both test files pass.

### Task 4: Full verification

**Files:**
- Verify all modified files.

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: verified feature behavior and repository health evidence.

- [ ] **Step 1: Run formatting and diff checks**

Run: `git diff --check`

Expected: exit 0 with no output.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0 with no lint errors.

- [ ] **Step 3: Run the complete test suite and production build**

Run: `npm test`

Expected: build succeeds and all Node tests pass with zero failures.

- [ ] **Step 4: Inspect the final diff against every design requirement**

Run: `git diff --stat && git diff -- app/components/project-menu.tsx app/components/app-shell.tsx app/components/harbor-app.tsx app/components/project-delete-navigation.ts app/globals.css tests/project-transfer-ui.test.mjs tests/project-delete-navigation.test.mjs`

Expected: only the approved owner menu, dialogs, callbacks, navigation helper, styles, and tests are present.
