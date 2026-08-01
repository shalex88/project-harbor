# Contacts Project Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `All projects` / single-project selector to the aggregate Contacts workspace and use the active selection as the default project for new contacts.

**Architecture:** Keep filtering entirely client-side over the authorized workspace snapshot. Put reusable selection/filter rules in a small pure module, keep the selected project in `HarborApp` so the header action can consume it, and keep presentation in `ContactsWorkspace`.

**Tech Stack:** TypeScript, React 19, Vinext/Next-compatible routes, Node test runner, CSS, Playwright browser QA.

## Global Constraints

- Work on the existing `feature/project-contacts` branch; do not create another worktree and never commit directly to `main`.
- The default selection is exactly `All projects` with value `all`.
- Filtering uses only `snapshot.contacts` and `snapshot.projects`; do not add API, repository, database, mutation, or archive changes.
- Keep project badges on cards in both filtered and unfiltered views.
- Do not add search, sorting, grouping, URL parameters, or filter persistence between Contacts visits.
- A selected project preselects the global new-contact form, but that form's project selector stays editable.
- Update the existing pull request after complete local and browser verification.

---

### Task 1: Pure contact project-filter rules

**Files:**
- Create: `lib/contact-filter.ts`
- Create: `tests/contact-filter.test.mjs`

**Interfaces:**
- Produces: `ALL_CONTACT_PROJECTS = "all"`.
- Produces: `contactsForProject<T extends { projectId: string }>(contacts: T[], selectedProjectId: string): T[]`.
- Produces: `normalizeContactProjectFilter(selectedProjectId: string, projects: Array<{ id: string }>): string`.
- Consumes: no application state or browser APIs.

- [ ] **Step 1: Write the failing behavioral tests**

Create `tests/contact-filter.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  ALL_CONTACT_PROJECTS,
  contactsForProject,
  normalizeContactProjectFilter,
} from "../lib/contact-filter.ts";

const contacts = [
  { id: "contact-a", projectId: "project-a" },
  { id: "contact-b", projectId: "project-b" },
  { id: "contact-c", projectId: "project-a" },
];

test("all projects preserves the authorized aggregate directory", () => {
  assert.equal(ALL_CONTACT_PROJECTS, "all");
  assert.deepEqual(contactsForProject(contacts, ALL_CONTACT_PROJECTS), contacts);
});

test("a project selection returns only that project's contacts", () => {
  assert.deepEqual(contactsForProject(contacts, "project-a"), [
    contacts[0],
    contacts[2],
  ]);
});

test("removed project selections reset to all projects", () => {
  const projects = [{ id: "project-a" }, { id: "project-b" }];
  assert.equal(normalizeContactProjectFilter("project-a", projects), "project-a");
  assert.equal(normalizeContactProjectFilter("missing", projects), "all");
  assert.equal(normalizeContactProjectFilter("all", projects), "all");
});
```

- [ ] **Step 2: Run the focused test and verify the red state**

Run:

```bash
node --experimental-strip-types --test tests/contact-filter.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/contact-filter.ts`.

- [ ] **Step 3: Implement the pure filter module**

Create `lib/contact-filter.ts`:

```ts
export const ALL_CONTACT_PROJECTS = "all";

export function contactsForProject<T extends { projectId: string }>(
  contacts: T[],
  selectedProjectId: string,
): T[] {
  return selectedProjectId === ALL_CONTACT_PROJECTS
    ? contacts
    : contacts.filter((contact) => contact.projectId === selectedProjectId);
}

export function normalizeContactProjectFilter(
  selectedProjectId: string,
  projects: Array<{ id: string }>,
): string {
  return selectedProjectId === ALL_CONTACT_PROJECTS ||
    projects.some((project) => project.id === selectedProjectId)
    ? selectedProjectId
    : ALL_CONTACT_PROJECTS;
}
```

- [ ] **Step 4: Run the focused test and verify the green state**

Run:

```bash
node --experimental-strip-types --test tests/contact-filter.test.mjs
```

Expected: 3 tests pass and 0 fail.

- [ ] **Step 5: Commit the pure filter slice**

```bash
git add lib/contact-filter.ts tests/contact-filter.test.mjs
git commit -m "feat: add contact project filter rules"
```

### Task 2: Contacts workspace selector and new-contact default

**Files:**
- Modify: `app/components/contact-directory.tsx`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/contact-ui.test.mjs`

**Interfaces:**
- Consumes: `ALL_CONTACT_PROJECTS`, `contactsForProject`, and `normalizeContactProjectFilter` from Task 1.
- Produces: `ContactsWorkspace` props `selectedProjectId: string` and `onSelectedProjectChange: (projectId: string) => void`.
- Produces: `HarborApp` state `contactProjectId` shared by the Contacts content and header action.

- [ ] **Step 1: Add failing Contacts UI contract assertions**

Extend `tests/contact-ui.test.mjs` with:

```js
test("contacts workspace filters by project and exposes an accessible selector", () => {
  assert.match(directory, /selectedProjectId: string/);
  assert.match(directory, /onSelectedProjectChange: \(projectId: string\) => void/);
  assert.match(directory, /contactsForProject\(snapshot\.contacts, selectedProjectId\)/);
  assert.match(directory, /aria-label="Filter contacts by project"/);
  assert.match(directory, /<option value=\{ALL_CONTACT_PROJECTS\}>All projects<\/option>/);
  assert.match(directory, /No contacts in this project/);
  assert.match(directory, /showProject/);
});

test("the Contacts route shares its filter with global contact creation", () => {
  assert.match(harborApp, /const \[contactProjectId, setContactProjectId\]/);
  assert.match(harborApp, /normalizeContactProjectFilter/);
  assert.match(harborApp, /selectedProjectId=\{contactProjectId\}/);
  assert.match(harborApp, /onSelectedProjectChange=\{setContactProjectId\}/);
  assert.match(harborApp, /contactProjectId !== ALL_CONTACT_PROJECTS/);
  assert.match(harborApp, /setContactProjectId\(ALL_CONTACT_PROJECTS\)/);
});
```

In the existing responsive test, isolate the contact-filter rule and assert:

```js
assert.match(styles, /\.contact-filter-bar[\s\S]*?margin-bottom:\s*16px/);
assert.match(styles, /\.contact-project-filter[\s\S]*?width:\s*min\(280px,\s*100%\)/);
assert.match(mobile, /\.contact-project-filter[\s\S]*?width:\s*100%/);
```

- [ ] **Step 2: Run the UI contracts and verify the red state**

Run:

```bash
node --experimental-strip-types --test tests/contact-ui.test.mjs
```

Expected: FAIL because selector props, state wiring, empty copy, and styles are absent.

- [ ] **Step 3: Add selectable filtering to `ContactsWorkspace`**

Import the Task 1 helpers and change the workspace signature:

```tsx
export function ContactsWorkspace({
  snapshot,
  selectedProjectId,
  onSelectedProjectChange,
  onEdit,
  onDelete,
}: {
  snapshot: WorkspaceSnapshot;
  selectedProjectId: string;
  onSelectedProjectChange: (projectId: string) => void;
  onEdit: (contact: ContactRecord) => void;
  onDelete: (contact: ContactRecord) => void;
}) {
  const contacts = contactsForProject(snapshot.contacts, selectedProjectId);
  const filtered = selectedProjectId !== ALL_CONTACT_PROJECTS;

  return (
    <section className="contacts-workspace" aria-label="All project contacts">
      <div className="contact-filter-bar" aria-label="Contact filters">
        <label className="contact-project-filter">
          <span>Project</span>
          <select
            aria-label="Filter contacts by project"
            value={selectedProjectId}
            onChange={(event) => onSelectedProjectChange(event.target.value)}
          >
            <option value={ALL_CONTACT_PROJECTS}>All projects</option>
            {snapshot.projects.map((project) => (
              <option value={project.id} key={project.id}>{project.name}</option>
            ))}
          </select>
        </label>
      </div>
      <ContactGrid
        contacts={contacts}
        projects={snapshot.projects}
        showProject
        emptyTitle={filtered ? "No contacts in this project" : "No contacts yet"}
        emptyDescription={filtered
          ? "Add the first contact for this project."
          : "Add a contact to any project to build your workspace directory."}
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </section>
  );
}
```

Add `emptyTitle = "No contacts yet"` to `ContactGrid` props and pass it to `EmptyState` instead of the fixed title.

- [ ] **Step 4: Lift the selection into `HarborApp` and reset it safely**

Add state initialized with `ALL_CONTACT_PROJECTS`:

```ts
const [contactProjectId, setContactProjectId] = useState(ALL_CONTACT_PROJECTS);
```

In `navigate`, reset it only when entering Contacts:

```ts
if (nextRoute === "contacts") setContactProjectId(ALL_CONTACT_PROJECTS);
```

Apply the same reset when `restoreLocation` handles a Contacts popstate. In
`acceptSnapshot`, retain a valid selection and reset a removed project:

```ts
setContactProjectId((current) =>
  normalizeContactProjectFilter(current, next.projects),
);
```

Pass the controlled state to `ContactsWorkspace`:

```tsx
selectedProjectId={contactProjectId}
onSelectedProjectChange={setContactProjectId}
```

Update `openGlobalContactCreate` so a specific filter wins over the first
project, while still verifying that the project exists:

```ts
const filteredProject =
  contactProjectId !== ALL_CONTACT_PROJECTS
    ? snapshot.projects.find((project) => project.id === contactProjectId)
    : undefined;
const projectId = filteredProject?.id ?? snapshot.projects[0]?.id;
```

Do not change the modal condition that renders its editable project selector
for `contactDialog.kind === "create" && route === "contacts"`.

- [ ] **Step 5: Add responsive selector styles**

Add:

```css
.contact-filter-bar {
  display: flex;
  margin-bottom: 16px;
}

.contact-project-filter {
  display: grid;
  width: min(280px, 100%);
  gap: 6px;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 700;
}

.contact-project-filter select {
  width: 100%;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 8px;
  outline: 0;
  background: var(--shell);
  color: var(--text-secondary);
  padding: 0 34px 0 12px;
}

.contact-project-filter select:focus {
  border-color: var(--seafoam);
}
```

Inside `@media (max-width: 640px)`, add:

```css
.contact-project-filter {
  width: 100%;
}
```

- [ ] **Step 6: Run focused tests and the production build**

Run:

```bash
node --experimental-strip-types --test tests/contact-filter.test.mjs tests/contact-ui.test.mjs tests/header-actions.test.mjs
npm run build
```

Expected: all focused tests pass and the production build includes `/contacts`.

- [ ] **Step 7: Commit the UI slice**

```bash
git add app/components/contact-directory.tsx app/components/harbor-app.tsx app/globals.css tests/contact-ui.test.mjs
git commit -m "feat: filter contacts by project"
```

### Task 3: Full verification and existing PR update

**Files:**
- Verify only; no planned source changes.

**Interfaces:**
- Consumes: the completed Contacts filter behavior from Tasks 1 and 2.
- Produces: fresh local, browser, and GitHub Actions evidence on the existing pull request.

- [ ] **Step 1: Run all automated verification**

Run:

```bash
npm test
npm run lint
git diff --check
```

Expected: production build succeeds, all tests pass with 0 failures, lint exits 0, and `git diff --check` prints nothing.

- [ ] **Step 2: Exercise the desktop browser flow**

At `http://localhost:5173/contacts`, verify:

1. `All projects` is selected on entry and contacts from both accessible projects are visible.
2. Selecting `בניית בית` shows only its contacts while retaining project badges.
3. Selecting a project with no contacts shows `No contacts in this project`.
4. `+ New contact` opens a form preselected to the filtered project and the Project control remains editable.
5. Returning through Contacts navigation resets the selector to `All projects`.

- [ ] **Step 3: Exercise the mobile browser flow**

At a 390 x 844 viewport, verify the project control fills the available width,
does not clip, and filtering produces the same results as desktop. Confirm no
new console errors during either browser flow.

- [ ] **Step 4: Push and verify the existing pull request**

Run:

```bash
git push
gh pr view 21 --json url,state,headRefName,baseRefName,statusCheckRollup
gh pr checks 21 --watch --interval 5
```

Expected: PR `#21` remains open from `feature/project-contacts` into `main`, and its required `test` check passes.
