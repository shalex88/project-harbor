# Project Navigation Currency Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove project currency codes from desktop and mobile project-navigation rows without changing currency data or project actions.

**Architecture:** Make a presentation-only change in the existing `AppShell` render paths and delete the associated obsolete CSS rule. Extend the established source contract test first, then verify both responsive surfaces in a real browser and run the repository-wide completion gates.

**Tech Stack:** React 19, TypeScript/TSX, CSS, Node.js test runner, Playwright CLI, Vinext/Vite build

## Global Constraints

- Desktop project-navigation rows show no currency code.
- Mobile More-panel project rows show no currency code.
- Currency remains unchanged everywhere outside project navigation.
- Project navigation and export-menu interactions continue to work.
- No hidden currency label remains in the navigation DOM.
- Use a test-first red-green cycle before editing production code.

---

### Task 1: Remove currency labels from both navigation render paths

**Files:**
- Modify: `tests/project-transfer-ui.test.mjs`
- Modify: `app/components/app-shell.tsx:114-198`
- Modify: `app/globals.css:283-286`

**Interfaces:**
- Consumes: the existing `projects.map((project) => ...)` desktop and mobile render paths in `AppShell`.
- Produces: project navigation buttons whose visible and accessible text contains the project name but not `project.currency`.

- [ ] **Step 1: Write the failing source contract test**

Append this test after `desktop and mobile project rows expose separate export menus` in `tests/project-transfer-ui.test.mjs`:

```js
test("project navigation omits currency labels on desktop and mobile", () => {
  const currencyLabels =
    shell.match(/<small>\{project\.currency\}<\/small>/g) ?? [];

  assert.equal(
    currencyLabels.length,
    0,
    "desktop and mobile project navigation must omit currency labels",
  );
  assert.doesNotMatch(styles, /\.project-nav-item small\s*\{/);
});
```

- [ ] **Step 2: Run the focused test and verify the expected failure**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
node --test tests/project-transfer-ui.test.mjs
```

Expected: FAIL only in `project navigation omits currency labels on desktop and mobile`; the assertion reports `2 !== 0` because the desktop and mobile currency labels still exist.

- [ ] **Step 3: Remove the desktop and mobile currency elements**

In both project buttons in `app/components/app-shell.tsx`, change:

```tsx
<span className="project-dot" aria-hidden="true" />
<span>{project.name}</span>
<small>{project.currency}</small>
```

to:

```tsx
<span className="project-dot" aria-hidden="true" />
<span>{project.name}</span>
```

Make this exact change once in the desktop `.project-nav-row` map and once in the mobile `.mobile-project-row` map. Do not change `ProjectMenu`, project selection handlers, project data, or other currency rendering.

- [ ] **Step 4: Remove the obsolete navigation-currency style**

Delete this complete rule from `app/globals.css`:

```css
.project-nav-item small {
  color: var(--text-muted);
  font-size: 10px;
}
```

- [ ] **Step 5: Run the focused test and verify it passes**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
node --test tests/project-transfer-ui.test.mjs
```

Expected: all tests in `tests/project-transfer-ui.test.mjs` pass with zero failures.

- [ ] **Step 6: Review the production diff for scope**

Run:

```bash
git diff -- app/components/app-shell.tsx app/globals.css tests/project-transfer-ui.test.mjs
```

Expected: the diff contains one new contract test, two removed currency elements, and one removed CSS rule. It contains no project-data, routing, export-menu, or financial-screen changes.

- [ ] **Step 7: Commit the tested navigation change**

Run:

```bash
git add tests/project-transfer-ui.test.mjs app/components/app-shell.tsx app/globals.css
git commit -m "fix: hide currency in project navigation"
```

Expected: Git creates one commit containing only the three files above.

---

### Task 2: Verify responsive rendering and repository health

**Files:**
- Verify: `app/components/app-shell.tsx`
- Verify: `app/globals.css`
- Verify: `tests/project-transfer-ui.test.mjs`

**Interfaces:**
- Consumes: the completed Task 1 render change.
- Produces: browser and command evidence for every acceptance criterion; no new application interface.

- [ ] **Step 1: Verify desktop project navigation in a real browser**

At a 1213 × 1098 viewport, open `http://localhost:5173/` and inspect the desktop sidebar. Confirm every project button's visible text and accessible name contains only the project name. Open a project's overflow menu and confirm the opaque `Export project` surface appears without changing the project list's scroll position or clipping its heading.

- [ ] **Step 2: Verify mobile project navigation in a real browser**

At an 800 × 900 viewport, open the More panel. Confirm every mobile project button's visible text and accessible name contains only the project name. Open an overflow menu and confirm it appears above the mobile sheet with the `Export project` action available.

- [ ] **Step 3: Run lint**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
npm run lint
```

Expected: exit code 0 with no ESLint errors.

- [ ] **Step 4: Run the production build and full test suite**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
npm test
```

Expected: production build completes and the Node test runner reports zero failures.

- [ ] **Step 5: Validate the hosting artifact**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
npm run validate:artifact
```

Expected: `Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.`

- [ ] **Step 6: Check Git whitespace and final status**

Run:

```bash
git diff --check
git status --short --branch
```

Expected: `git diff --check` prints nothing and exits 0; status shows `codex/project-import-export` with no uncommitted files.
