# Contacts Spending-Style Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Contacts project selector use the same compact visual treatment as Spending without changing its behavior.

**Architecture:** Reuse the existing `dashboard-stack`, `filter-bar`, `filter-control`, and `sr-only` presentation contract already used by Spending. Keep `ContactsWorkspace` controlled by the same props and remove only the now-redundant Contacts-specific filter CSS.

**Tech Stack:** React 19, TypeScript, CSS, Node test runner, React server rendering

## Global Constraints

- Preserve the existing project options, controlled value, contact filtering, filtered empty state, creation default, and navigation-reset behavior.
- Keep `aria-label="Filter contacts by project"` on the select.
- Do not extract or refactor the Spending dashboard components.
- Use the existing responsive rules for `filter-bar` and `filter-control`.
- Use `dashboard-stack` on the Contacts region so filter-to-content spacing matches Spending.

---

### Task 1: Reuse the Spending filter presentation in Contacts

**Files:**
- Modify: `tests/contact-ui.test.mjs:128-138`
- Modify: `app/components/contact-directory.tsx:114-131`
- Modify: `app/globals.css:1536-1563`

**Interfaces:**
- Consumes: `ContactsWorkspace` props `selectedProjectId: string` and `onSelectedProjectChange: (projectId: string) => void`
- Produces: the existing Contacts filter behavior rendered with shared classes `filter-bar` and `filter-control`

- [ ] **Step 1: Write the failing rendered regression assertions**

Add these assertions to `contacts workspace renders a project selector and only the selected contacts` in `tests/contact-ui.test.mjs`:

```js
assert.match(
  html,
  /^<section class="contacts-workspace dashboard-stack" aria-label="Contacts">/,
);
assert.match(
  html,
  /<div class="filter-bar" aria-label="Contact filters"><label class="filter-control"><span class="sr-only">Filter contacts by project<\/span>/,
);
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
node --experimental-strip-types --test tests/contact-ui.test.mjs
```

Expected: FAIL because Contacts still renders `contact-filter-bar`, `contact-project-filter`, a visible `Project` label, and lacks the shared `dashboard-stack` spacing.

- [ ] **Step 3: Replace the Contacts-only filter presentation**

Change the filter markup in `app/components/contact-directory.tsx` to:

```tsx
<section className="contacts-workspace dashboard-stack" aria-label="Contacts">
<div className="filter-bar" aria-label="Contact filters">
  <label className="filter-control">
    <span className="sr-only">Filter contacts by project</span>
    <select
      aria-label="Filter contacts by project"
      value={selectedProjectId}
      onChange={(event) => onSelectedProjectChange(event.target.value)}
    >
      <option value={ALL_CONTACT_PROJECTS}>All projects</option>
      {snapshot.projects.map((project) => (
        <option value={project.id} key={project.id}>
          {project.name}
        </option>
      ))}
    </select>
  </label>
</div>
</section>
```

Delete the `.contact-filter-bar`, `.contact-project-filter`, `.contact-project-filter select`, and `.contact-project-filter select:focus` rules from `app/globals.css`. Do not alter the shared `.filter-bar` or `.filter-control` rules.

- [ ] **Step 4: Run the focused test to verify it passes**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
node --experimental-strip-types --test tests/contact-ui.test.mjs
```

Expected: all Contacts UI tests PASS.

- [ ] **Step 5: Verify desktop and mobile rendering**

Open `/contacts` and confirm:

- The selector has the same compact appearance as Spending.
- The visible `Project` label is absent while the accessible label remains.
- The selector is not clipped at desktop or mobile widths.
- Selecting a project still filters the cards.

- [ ] **Step 6: Run full repository verification**

Run:

```bash
export PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH
npm test
npm run lint
git diff --check
```

Expected: production build and all tests PASS, lint exits with no errors, and `git diff --check` reports no whitespace errors.

- [ ] **Step 7: Commit the implementation**

```bash
git add app/components/contact-directory.tsx app/globals.css tests/contact-ui.test.mjs
git commit -m "fix: match contacts filter to spending"
```
