# Project Transfer Corrections Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the export context menu opaque, lock exact payment/file snapshot semantics into tests, and restore a clean local source-versus-import comparison.

**Architecture:** The visual fix stays in the existing project-menu CSS and uses the already-defined opaque card token. The archive implementation remains unchanged because live evidence shows it correctly imports a point-in-time snapshot; focused service tests characterize that exact behavior. Local fixture repair uses the authenticated project APIs and only the two identified imported copies.

**Tech Stack:** TypeScript 5.9, React 19, Next 16/Vinext, Cloudflare D1 and R2, Node test runner, CSS custom properties.

## Global Constraints

- Archives remain immutable point-in-time snapshots and import always creates a new independent project.
- Payments, attachments, receipts, attachment bytes, and pinned state must match the archive exactly.
- The context menu must use an opaque existing design-system surface.
- The source project `project-q3-planning` must not be mutated during local fixture repair.
- Only imported projects `463b51f0-9ef5-4988-9e30-c29996476df2` and `d0495ebc-dc77-40d2-ab45-8b2a128331fb` may be removed from the local fixture.

---

## File Structure

- `app/globals.css`: owns the context-menu surface token.
- `tests/project-transfer-ui.test.mjs`: protects the opaque menu contract.
- `tests/project-transfer-routes.test.mjs`: characterizes exact snapshot export semantics.
- `docs/superpowers/specs/2026-07-22-project-transfer-corrections-design.md`: records root cause and product decisions.
- `docs/superpowers/plans/2026-07-22-project-transfer-corrections.md`: records this executable plan.

---

### Task 1: Opaque project context menu

**Files:**
- Modify: `tests/project-transfer-ui.test.mjs`
- Modify: `app/globals.css:211`

**Interfaces:**
- Consumes: the existing opaque `--card: #122235` root token.
- Produces: an opaque `.project-context-menu` surface without changing menu behavior.

- [ ] **Step 1: Write the failing style assertion**

Add this test:

```js
test("project export menu uses an opaque surface", () => {
  const menuRule = styles.match(/\.project-context-menu\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(menuRule, /background:\s*var\(--card\)/);
  assert.doesNotMatch(menuRule, /var\(--panel-strong\)/);
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-transfer-ui.test.mjs
```

Expected: FAIL because `.project-context-menu` uses undefined `--panel-strong`.

- [ ] **Step 3: Use the opaque card token**

Change the menu declaration to:

```css
.project-context-menu {
  background: var(--card);
}
```

Keep the other declarations in the rule unchanged.

- [ ] **Step 4: Run the focused test**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/globals.css tests/project-transfer-ui.test.mjs
git commit -m "fix: make project export menu opaque"
```

---

### Task 2: Exact snapshot regression coverage

**Files:**
- Modify: `tests/project-transfer-routes.test.mjs`

**Interfaces:**
- Consumes: `createProjectTransferService`, `encodeProjectArchive`, and `decodeProjectArchive`.
- Produces: regression coverage proving payment/file arrays and unpinned state come only from the source loaded for that export.

- [ ] **Step 1: Strengthen the full export characterization**

In `export loads every stored payload and produces a valid Harbor archive`, add:

```js
assert.deepEqual(decoded.manifest.payments, fixture.manifest.payments);
assert.deepEqual(decoded.manifest.attachments, fixture.manifest.attachments);
assert.deepEqual(decoded.manifest.receipts, fixture.manifest.receipts);
assert.equal(decoded.manifest.attachments[0].pinned, false);
```

- [ ] **Step 2: Add a zero-asset source characterization**

Add a test whose `loadSource` returns the fixture project, collections, items,
and relations with empty `payments`, `attachments`, and `receipts`. Export and
decode it, then assert:

```js
assert.deepEqual(decoded.manifest.payments, []);
assert.deepEqual(decoded.manifest.attachments, []);
assert.deepEqual(decoded.manifest.receipts, []);
assert.deepEqual(decoded.payloads, new Map());
```

- [ ] **Step 3: Run focused transfer tests**

Run:

```bash
node --experimental-strip-types --test tests/project-transfer-routes.test.mjs tests/project-transfer-repository.test.mjs
```

Expected: PASS, confirming the reported mismatch is stale archive state rather than cross-project leakage.

- [ ] **Step 4: Commit**

```bash
git add tests/project-transfer-routes.test.mjs
git commit -m "test: lock project archive snapshot fidelity"
```

---

### Task 3: Local fixture repair and browser verification

**Files:**
- No repository files.

**Interfaces:**
- Consumes: `GET /api/projects/project-q3-planning/archive`, `POST /api/workspace`, and `POST /api/projects/import`.
- Produces: the original source plus one fresh independent import with matching zero-payment and zero-attachment state.

- [ ] **Step 1: Export the current source to a temporary archive**

Use `mktemp -d`, download `/api/projects/project-q3-planning/archive`, and
inspect `manifest.json`. Expected: empty `payments`, `attachments`, and
`receipts` arrays.

- [ ] **Step 2: Remove only the two stale imported copies**

POST the normal `delete_project` mutation to `/api/workspace` for project IDs
`463b51f0-9ef5-4988-9e30-c29996476df2` and
`d0495ebc-dc77-40d2-ab45-8b2a128331fb`. Expected: the source project remains.

- [ ] **Step 3: Import the fresh temporary archive once**

POST the downloaded bytes to `/api/projects/import` with
`Content-Type: application/zip`. Expected: one new project ID and a refreshed
workspace snapshot.

- [ ] **Step 4: Verify snapshot equality**

Compare the source and fresh import in `/api/workspace`. Expected: both
`Prepare stakeholder update` tasks have `actualSpendMinor: 0`, `files: []`, and
`payments: []`.

- [ ] **Step 5: Verify the browser UI**

Open the project overflow menu and confirm its computed background is opaque.
Check Spending and Tasks for matching source/import actual spend and attachment
indicators.

---

### Task 4: Full verification

**Files:**
- No new files.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: evidence that the correction is ready for branch handoff.

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run all tests**

```bash
npm test
```

Expected: every test passes.

- [ ] **Step 3: Run the production artifact build**

```bash
npm run build
```

Expected: the production build and artifact validation both succeed.

- [ ] **Step 4: Inspect branch status**

```bash
git status --short --branch
git log -5 --oneline --decorate
```

Expected: no uncommitted changes and the correction commits are on `codex/project-import-export`.
