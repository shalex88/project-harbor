# Remove Mobile Create Action Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the redundant generic `+ Create` button from the mobile header while preserving page-specific `+ New …` workspace actions.

**Architecture:** Keep route-specific action selection and workspace-header rendering unchanged. Remove only the generic primary-action projection from `AppShell`'s mobile header and protect the behavior with a server-rendered component regression test.

**Tech Stack:** React 19, TypeScript, Node test runner, `react-dom/server`, `tsx`

## Global Constraints

- Apply the removal on every route.
- Preserve all existing page-specific `+ New project`, `+ New task`, and `+ New event` actions.
- Do not change creation handlers, route mappings, navigation, data, or styles.
- Keep the work local: do not push, save a Sites version, or deploy.

---

### Task 1: Remove the generic mobile creation action

**Files:**
- Modify: `tests/header-actions.test.mjs`
- Modify: `app/components/app-shell.tsx`

**Interfaces:**
- Consumes: `AppShell` props `primaryAction?: { label: string; onClick: () => void }` and the existing `.mobile-header` / `.workspace-header` markup.
- Produces: A mobile header containing only the Harbor brand and an unchanged workspace header containing page-specific actions.

- [ ] **Step 1: Write the failing regression test**

Add a server-rendered `AppShell` test that supplies `primaryAction: { label:
"New task", onClick: noop }`, slices the mobile and workspace headers from the
HTML, and asserts:

```js
assert.doesNotMatch(mobileHeader, />\+ Create</);
assert.match(workspaceHeader, />\+ New task<\/button>/);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: FAIL because `.mobile-header` currently renders `+ Create`.

- [ ] **Step 3: Implement the minimal component change**

Delete only the conditional `primaryAction` button from `.mobile-header` in
`app/components/app-shell.tsx`. Leave the brand button and all
`.workspace-header` action rendering intact.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
node --experimental-strip-types --test tests/header-actions.test.mjs
```

Expected: PASS with all header-action tests green.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run lint
```

Expected: both commands exit successfully with no test or lint failures.

- [ ] **Step 6: Review the local diff**

Run:

```bash
git diff --check
git status --short --branch
git diff -- app/components/app-shell.tsx tests/header-actions.test.mjs
```

Expected: no whitespace errors; only the planned component and test behavior
changes appear in the implementation diff. Do not push or deploy.
