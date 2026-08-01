# Project Contacts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add project-scoped external contacts to a global Contacts workspace and each project page, with member-managed CRUD and project archive import/export.

**Architecture:** Store contacts in a `project_contacts` table and expose them through the existing workspace snapshot and strict mutation API. Keep contact presentation in one focused React component, with dialog state and mutations composed by `HarborApp`, so the global and project surfaces share behavior. Extend archive version 1 additively with an optional-on-read, always-written contacts array.

**Tech Stack:** TypeScript, React 19, Vinext/Next-compatible routes, Cloudflare D1, Drizzle ORM, Node test runner, CSS.

## Global Constraints

- Never commit directly to `main`; use the existing `feature/project-contacts` branch.
- Do not create or use another Git worktree.
- A contact belongs to exactly one project and remains separate from members and invitations.
- Every project member may create, edit, and delete contacts for projects they can access.
- Contact name is required and limited to 160 characters.
- `roleOrCompany` is optional and limited to 160 characters; `email` to 254; `phone` to 80; `notes` to 2,000.
- Optional contact strings are trimmed and stored as empty strings.
- The first version has no search, filters, deduplication, cross-project linking, or moving contacts.
- Exports always contain contacts; version-1 archives that omit contacts still import as having no contacts.
- When complete and verified, push the branch and open a pull request.

---

### Task 1: Contact domain model, schema, migration, and snapshot

**Files:**
- Modify: `db/schema.ts`
- Modify: `lib/domain.ts`
- Modify: `lib/repository.ts`
- Create: generated `drizzle/0005_*.sql`
- Modify: generated `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0005_snapshot.json`
- Modify: `tests/schema-contract.test.mjs`
- Modify: `tests/repository-contract.test.mjs`

**Interfaces:**
- Produces: `ContactRecord = { id; projectId; name; roleOrCompany; email; phone; notes; createdAt; updatedAt }`.
- Produces: `WorkspaceSnapshot.contacts: ContactRecord[]` ordered by `name COLLATE NOCASE, id` and scoped through current project membership.
- Consumes: existing `projects` cascade and `project_members` access joins.

- [ ] **Step 1: Write failing schema and snapshot contract tests**

Add assertions equivalent to:

```js
test("project contacts are project scoped and cascade with their project", () => {
  assert.match(migration, /CREATE TABLE `project_contacts`/);
  assert.match(migration, /FOREIGN KEY \(`project_id`\) REFERENCES `projects`\(`id`\) ON DELETE cascade/);
  assert.match(migration, /CREATE INDEX `project_contacts_project_name_idx`/);
});

test("workspace snapshot includes membership-scoped contacts", () => {
  assert.match(source, /FROM project_contacts pc/);
  assert.match(source, /JOIN project_members current ON current\.project_id = pc\.project_id/);
  assert.match(source, /contacts: contacts\.map<ContactRecord>/);
  assert.match(source, /ORDER BY pc\.name COLLATE NOCASE,pc\.id/);
});
```

- [ ] **Step 2: Run focused tests and verify the new assertions fail**

Run: `node --experimental-strip-types --test tests/schema-contract.test.mjs tests/repository-contract.test.mjs`

Expected: FAIL because `project_contacts` and snapshot contacts do not exist.

- [ ] **Step 3: Add contact domain and Drizzle schema**

Add the domain shape and snapshot field:

```ts
export type ContactRecord = {
  id: string;
  projectId: string;
  name: string;
  roleOrCompany: string;
  email: string;
  phone: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkspaceSnapshot = {
  // existing fields
  contacts: ContactRecord[];
};
```

Add `projectContacts` to `db/schema.ts` with a cascading `projectId` foreign key, text fields defaulting to `""`, timestamps, and `index("project_contacts_project_name_idx").on(table.projectId, table.name)`.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate`

Expected: a migration creating `project_contacts` and its project/name index, plus Drizzle metadata updates. Confirm it does not recreate or drop unrelated tables.

- [ ] **Step 5: Add preview schema, development seed, and snapshot loading**

Add the matching `CREATE TABLE` and index statements to `PREVIEW_SCHEMA`. Seed at least one realistic contact for two seeded projects. Query contacts with:

```sql
SELECT pc.id,pc.project_id,pc.name,pc.role_or_company,pc.email,pc.phone,
       pc.notes,pc.created_at,pc.updated_at
FROM project_contacts pc
JOIN project_members current ON current.project_id = pc.project_id
WHERE current.user_id = ?
ORDER BY pc.name COLLATE NOCASE,pc.id
```

Map rows to `ContactRecord` and include `contacts` in every returned snapshot.

- [ ] **Step 6: Run focused tests and type-aware build**

Run: `node --experimental-strip-types --test tests/schema-contract.test.mjs tests/repository-contract.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: PASS with the new snapshot field fully typed.

- [ ] **Step 7: Commit the persistence slice**

```bash
git add db/schema.ts lib/domain.ts lib/repository.ts drizzle tests/schema-contract.test.mjs tests/repository-contract.test.mjs
git commit -m "feat: persist project contacts"
```

### Task 2: Strict contact mutations and authorized CRUD

**Files:**
- Modify: `lib/domain.ts`
- Modify: `lib/mutations.ts`
- Modify: `lib/repository.ts`
- Modify: `tests/api-contract.test.mjs`
- Create: `tests/contact-repository-contract.test.mjs`

**Interfaces:**
- Produces: `WorkspaceMutation` variants `create_contact`, `update_contact`, and `delete_contact`.
- Produces: repository mutation cases that call `requireProjectAccess` before writes.
- Consumes: `optionalText(value, maxLength)`, `requireText(value, label, maxLength)`, `projectForContact(contactId)`.

- [ ] **Step 1: Write failing parser tests**

Add exact successful and rejected examples:

```js
assert.deepEqual(parseMutation({
  action: "create_contact",
  projectId: "project-1",
  name: "  Dana Cohen  ",
  roleOrCompany: " Architect ",
  email: " dana@example.com ",
  phone: " +972 50 123 4567 ",
  notes: " Main planning contact ",
}), {
  action: "create_contact",
  projectId: "project-1",
  name: "Dana Cohen",
  roleOrCompany: "Architect",
  email: "dana@example.com",
  phone: "+972 50 123 4567",
  notes: "Main planning contact",
});
```

Also assert blank name, over-limit fields, a create payload without project ID, update with project ID, delete with extra fields, and unknown fields all throw `DomainError`.

- [ ] **Step 2: Write failing repository authorization contract tests**

Assert source-level ordering and scope for all cases:

```js
assert.match(source, /case "create_contact"[\s\S]*?requireProjectAccess\(user\.id, mutation\.projectId\)[\s\S]*?INSERT INTO project_contacts/);
assert.match(source, /case "update_contact"[\s\S]*?projectForContact\(mutation\.contactId\)[\s\S]*?requireProjectAccess/);
assert.match(source, /case "delete_contact"[\s\S]*?projectForContact\(mutation\.contactId\)[\s\S]*?requireProjectAccess/);
assert.doesNotMatch(updateCase, /project_id\s*=/i);
```

- [ ] **Step 3: Run focused tests and verify failure**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs tests/contact-repository-contract.test.mjs`

Expected: FAIL because contact mutations and repository cases are absent.

- [ ] **Step 4: Implement domain variants and strict parsing**

Use one helper in `lib/mutations.ts`:

```ts
function contactFields(value: JsonObject) {
  return {
    name: requireText(value.name, "Contact name", 160),
    roleOrCompany: optionalText(value.roleOrCompany, 160),
    email: optionalText(value.email, 254),
    phone: optionalText(value.phone, 80),
    notes: optionalText(value.notes, 2_000),
  };
}
```

Create permits `projectId` plus these five fields. Update permits `contactId` plus the five fields. Delete permits only `contactId`.

- [ ] **Step 5: Implement authorized repository CRUD**

Add:

```ts
async function projectForContact(contactId: string): Promise<string> {
  const row = await first<{ project_id: string }>(
    "SELECT project_id FROM project_contacts WHERE id = ?",
    contactId,
  );
  if (!row) throw new DomainError("Contact not found", "not_found");
  return row.project_id;
}
```

In create, authorize the submitted project before inserting a UUID and normalized fields. In update and delete, resolve the stored project, authorize it, and write by contact ID. Update only the five editable fields plus `updated_at`; never update `project_id`.

- [ ] **Step 6: Run focused and related mutation tests**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs tests/contact-repository-contract.test.mjs tests/authorization.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit contact CRUD**

```bash
git add lib/domain.ts lib/mutations.ts lib/repository.ts tests/api-contract.test.mjs tests/contact-repository-contract.test.mjs
git commit -m "feat: add contact mutations"
```

### Task 3: Archive contacts with backward-compatible version-1 parsing

**Files:**
- Modify: `lib/project-archive.ts`
- Modify: `lib/project-transfer.ts`
- Modify: `lib/project-transfer-repository.ts`
- Modify: `tests/project-transfer-routes.test.mjs`
- Modify: `tests/project-transfer-repository.test.mjs`
- Modify: `tests/project-archive.test.mjs`

**Interfaces:**
- Produces: `ProjectArchiveContact` and `ProjectArchiveManifestV1.contacts`.
- Produces: `PlannedProjectImport.contactIds: Map<string, string>`.
- Consumes: `parseProjectArchiveManifest`, `loadProjectArchiveSource`, `persistProjectImport`.

- [ ] **Step 1: Write failing archive parser tests**

Add a contact fixture:

```js
contacts: [{
  id: "contact-1",
  name: "Dana Cohen",
  roleOrCompany: "Architect",
  email: "dana@example.com",
  phone: "+972 50 123 4567",
  notes: "Planning lead",
  createdAt: "2026-07-01T10:00:00.000Z",
  updatedAt: "2026-07-02T10:00:00.000Z",
}]
```

Prove valid contacts parse, duplicate IDs and unknown/over-limit fields fail, and a version-1 manifest with no `contacts` property parses with `contacts: []`.

- [ ] **Step 2: Write failing export/import plan tests**

Assert exported sources include project-scoped contacts, `createImportIdPlan` gives every contact a fresh ID, two imports get distinct contact IDs, and persistence inserts contacts with the new project ID and preserved values/timestamps.

- [ ] **Step 3: Run focused archive tests and verify failure**

Run: `node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-transfer-routes.test.mjs tests/project-transfer-repository.test.mjs`

Expected: FAIL because manifests and import plans have no contacts.

- [ ] **Step 4: Extend the manifest parser additively**

Define `ProjectArchiveContact` with the seven fields above. Permit `contacts` at the manifest root, parse it strictly, default an omitted value to `[]`, and include contact IDs in duplicate validation:

```ts
contacts: value.contacts === undefined
  ? []
  : asArray(value.contacts, "Contacts").map(parseContact),
```

Keep `PROJECT_ARCHIVE_VERSION = 1`.

- [ ] **Step 5: Export, remap, and persist contacts**

Load contacts by project ordered by `name COLLATE NOCASE,id`, include `contacts: source.contacts` in exported manifests, create `contactIds`, and append one prepared insert per manifest contact to the existing import batch:

```sql
INSERT INTO project_contacts
(id,project_id,name,role_or_company,email,phone,notes,created_at,updated_at)
VALUES (?,?,?,?,?,?,?,?,?)
```

- [ ] **Step 6: Run focused archive tests**

Run: `node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-transfer-routes.test.mjs tests/project-transfer-repository.test.mjs`

Expected: PASS, including old version-1 fixtures that omit contacts.

- [ ] **Step 7: Commit archive support**

```bash
git add lib/project-archive.ts lib/project-transfer.ts lib/project-transfer-repository.ts tests/project-archive.test.mjs tests/project-transfer-routes.test.mjs tests/project-transfer-repository.test.mjs
git commit -m "feat: include contacts in project archives"
```

### Task 4: Shared contact cards and project Contacts section

**Files:**
- Create: `app/components/contact-directory.tsx`
- Modify: `app/components/project-workspace.tsx`
- Modify: `app/globals.css`
- Create: `tests/contact-ui.test.mjs`

**Interfaces:**
- Produces: `ContactGrid({ contacts, projects, showProject, onEdit, onDelete })`.
- Produces: project workspace props `onCreateContact(projectId)`, `onEditContact(contact)`, `onDeleteContact(contact)`.
- Consumes: `ContactRecord`, `ProjectRecord`, and existing `EmptyState`.

- [ ] **Step 1: Write failing UI contract tests**

Assert the shared component renders `mailto:` and `tel:` links only when values exist, uses project labels when `showProject` is true, exposes Edit/Delete buttons, and renders the contact notes. Assert `ProjectWorkspace` filters `snapshot.contacts` by project and places a Contacts section before `people-section` with `+ New contact`.

- [ ] **Step 2: Run the contact UI contract and verify failure**

Run: `node --experimental-strip-types --test tests/contact-ui.test.mjs`

Expected: FAIL because the component and section do not exist.

- [ ] **Step 3: Implement the focused shared card component**

Create a responsive semantic grid. Each card uses `dir="auto"` for user-entered text, project name via a project-ID map, links `href={`mailto:${contact.email}`}` and `href={`tel:${contact.phone}`}`, and buttons that pass the exact contact to edit/delete callbacks. Render `EmptyState title="No contacts yet" description="Add the people relevant to this project."` when empty.

- [ ] **Step 4: Add the project section**

Filter once:

```ts
const contacts = snapshot.contacts.filter(
  (contact) => contact.projectId === projectId,
);
```

Render the Contacts heading, add button, and `ContactGrid` after collection work and before Members. Pass create/edit/delete events up to `HarborApp`; do not perform contact mutations directly in the card component.

- [ ] **Step 5: Add desktop and mobile contact styles**

Add `.contact-section`, `.contact-grid`, `.contact-card`, `.contact-details`, `.contact-notes`, `.contact-project`, and `.contact-actions`. Use three columns on desktop, two under 980px, and one under 640px. Allow long email, phone, and notes to wrap without horizontal overflow.

- [ ] **Step 6: Run the focused UI contract**

Run: `node --experimental-strip-types --test tests/contact-ui.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit shared/project UI**

```bash
git add app/components/contact-directory.tsx app/components/project-workspace.tsx app/globals.css tests/contact-ui.test.mjs
git commit -m "feat: show contacts in projects"
```

### Task 5: Contacts workspace, navigation, and shared contact dialogs

**Files:**
- Create: `app/contacts/page.tsx`
- Modify: `app/components/app-shell.tsx`
- Modify: `app/components/header-actions.ts`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/components/contact-directory.tsx`
- Modify: `tests/contact-ui.test.mjs`
- Modify: `tests/header-actions.test.mjs`
- Modify: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Produces: `AppRoute` member `"contacts"` and route `/contacts`.
- Produces: `ContactsWorkspace` showing all accessible `snapshot.contacts` with project labels.
- Produces: one `ContactDialogState` in `HarborApp` for create, edit, and delete.
- Consumes: contact mutations from Task 2 and `ContactGrid` from Task 4.

- [ ] **Step 1: Write failing navigation and route tests**

Assert desktop `NAV_ITEMS` contains Contacts after Spending, mobile More contains Contacts, `/contacts` renders `WorkspaceEntry initialRoute="contacts"`, `appLocation("/contacts")` returns contacts, and route title is Contacts. Assert the Contacts route has primary header action `contact` while other header actions are unchanged.

- [ ] **Step 2: Write failing dialog/composition tests**

Assert the form has `name`, `roleOrCompany`, `email`, `phone`, and `notes` with max lengths `160`, `160`, `254`, `80`, and `2000`; global create includes a project select; edit does not allow project changes; delete has confirmation; and submitted payloads use the exact three mutation action names.

- [ ] **Step 3: Run focused UI/navigation tests and verify failure**

Run: `node --experimental-strip-types --test tests/contact-ui.test.mjs tests/header-actions.test.mjs tests/mobile-contract.test.mjs`

Expected: FAIL because the Contacts route, navigation, and dialogs are absent.

- [ ] **Step 4: Add route and navigation**

Add `"contacts"` to `AppRoute`, desktop navigation after Spending with a contact mark, Contacts in mobile More, and:

```tsx
export default function ContactsPage() {
  return <WorkspaceEntry initialRoute="contacts" returnTo="/contacts" />;
}
```

Teach `appLocation`, `routePath`, title selection, and content selection about contacts.

- [ ] **Step 5: Add the aggregate workspace and header action**

Export `ContactsWorkspace` from `contact-directory.tsx`. Render all snapshot contacts with `showProject`, and a useful all-project empty state. Extend `HeaderActionKind` with `"contact"`; `headerActionsForRoute("contacts")` returns `{ primary: "contact" }`; `HarborApp` maps that action to `+ New contact` and opens create state using the first accessible project.

- [ ] **Step 6: Implement centralized create/edit/delete dialogs**

Use:

```ts
type ContactDialogState =
  | { kind: "create"; projectId: string }
  | { kind: "edit"; contact: ContactRecord }
  | { kind: "delete"; contact: ContactRecord }
  | null;
```

On create, show a project selector only from the global route; project-section creates receive a fixed project ID. On edit, show fields only. Build mutations from `FormData`, await `mutate`, and close only after success. Delete awaits `delete_contact` and closes after success. Add `successMessage` labels Contact created/updated/deleted.

- [ ] **Step 7: Run focused tests and production build**

Run: `node --experimental-strip-types --test tests/contact-ui.test.mjs tests/header-actions.test.mjs tests/mobile-contract.test.mjs`

Expected: PASS.

Run: `npm run build`

Expected: PASS with no missing route or snapshot types.

- [ ] **Step 8: Commit the aggregate experience**

```bash
git add app/contacts/page.tsx app/components/app-shell.tsx app/components/header-actions.ts app/components/harbor-app.tsx app/components/contact-directory.tsx tests/contact-ui.test.mjs tests/header-actions.test.mjs tests/mobile-contract.test.mjs
git commit -m "feat: add contacts workspace"
```

### Task 6: Full verification, browser inspection, documentation, and pull request

**Files:**
- Modify: `README.md`
- Modify: any fixtures identified by the full suite to add `contacts: []` without weakening assertions.

**Interfaces:**
- Consumes: all contact persistence, API, archive, and UI interfaces from Tasks 1–5.
- Produces: verified feature branch and pull request.

- [ ] **Step 1: Update product documentation**

Add project contact directories and project export/import preservation to README Product Shape. Do not describe search, deduplication, or contact-based access.

- [ ] **Step 2: Run formatting and static checks**

Run: `git diff --check`

Expected: no output.

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Run complete automated verification**

Run: `npm test`

Expected: production build, artifact validation, rendered metadata checks, and every Node test PASS.

- [ ] **Step 4: Apply local migration and inspect the UI**

Run: `npm run dev:setup`

Run: `npm run dev`

In the browser, verify at desktop and mobile widths:

- Contacts appears in desktop navigation and mobile More.
- The aggregate workspace shows contacts from multiple projects with project labels.
- Global create lets the member select a project.
- Project create is fixed to the active project.
- Edit changes fields without changing project.
- Delete confirms and removes the contact.
- Email and phone links have correct `mailto:` and `tel:` destinations.
- Empty, populated, long-note, Hebrew/RTL name, and narrow-screen cards do not overflow.

- [ ] **Step 5: Verify archive round trip against the running app**

Create a contact, export its project, import the archive, and confirm the imported project shows the same contact values with independent IDs. Also import a pre-contact version-1 fixture and confirm it succeeds with an empty Contacts section.

- [ ] **Step 6: Commit documentation or fixture corrections**

```bash
git add README.md tests app lib db drizzle
git commit -m "docs: document project contacts"
```

If there are no uncommitted changes, skip this commit rather than creating an empty one.

- [ ] **Step 7: Review final branch scope**

Run: `git status --short --branch`

Expected: clean `feature/project-contacts` branch.

Run: `git diff --stat main...HEAD && git log --oneline main..HEAD`

Expected: only the contact feature, its spec/plan, migration, tests, and README changes.

- [ ] **Step 8: Push and open a pull request**

```bash
git push -u origin feature/project-contacts
gh pr create --base main --head feature/project-contacts --title "Add project contact directories" --body-file /tmp/project-contacts-pr.md
```

The PR body must summarize project-scoped contact CRUD, both UI surfaces, archive compatibility, and the exact verification commands and results.
