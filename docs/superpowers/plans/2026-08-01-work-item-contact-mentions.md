# Work Item Contact Mentions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users manually link project contacts to tasks and events or insert structured `@` mentions by contact name or role, with current contact details available through Call, Email, and View contact actions.

**Architecture:** Persist a deduplicated item-contact join plus field/range mention occurrences, and expose both as arrays on every work-item snapshot. Keep mention editing logic in pure helpers, render saved mentions through shared components, and integrate one mention-aware editor into both title and description fields while preserving the existing workspace mutation flow.

**Tech Stack:** TypeScript 5.9, React 19, Next/Vinext, Drizzle ORM, Cloudflare D1/SQLite, Node test runner, Miniflare, CSS.

## Global Constraints

- Work on `feature/work-item-contact-mentions`; never commit directly to `main` and do not create another worktree.
- Keep Node.js `>=22.13.0` and add no runtime or test dependency.
- Contacts and mentions must remain within the work item's project at both repository and database boundaries.
- Store offsets as zero-based, end-exclusive JavaScript UTF-16 string indices.
- Support Hebrew, English, and mixed-direction text with automatic base direction and bidirectional isolation.
- Treat plain `@` text as unlinked unless valid mention metadata identifies its exact range.
- Keep `manualContactIds` and `contactMentions` optional on incoming item mutations, defaulting to empty arrays.
- Save the item, its deduplicated contact links, and all mention occurrences in one D1 batch.
- Preserve pre-feature project archives by treating omitted contact-link and mention collections as empty.
- Use only `tel:` and `mailto:` for communication; do not send messages, create contacts in the picker, notify contacts, assign responsibility, or add general rich-text formatting.

---

### Task 1: Pure contact-mention model and editing rules

**Files:**
- Create: `lib/work-item-contacts.ts`
- Modify: `lib/domain.ts`
- Test: `tests/work-item-contact-model.test.mjs`

**Interfaces:**
- Consumes: existing `ContactRecord`, `DomainError`, `WorkItemRecord`, and JavaScript string indices.
- Produces: `ContactMentionField`, `ContactMentionInput`, `WorkItemContactLinkRecord`, `WorkItemContactMentionRecord`, `MentionEditorValue`, `findMentionQuery`, `rankMentionContacts`, `insertContactMention`, `reconcileMentionText`, `removeContactMentions`, `normalizeMentionLabels`, and `serializeMentionField`.

- [ ] **Step 1: Write failing pure-model tests**

Create `tests/work-item-contact-model.test.mjs` with direct tests for Hebrew and English role search, email-address exclusion, insertion, range shifting, editing through a token, contact removal, and current-name normalization:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  findMentionQuery,
  insertContactMention,
  normalizeMentionLabels,
  rankMentionContacts,
  reconcileMentionText,
  removeContactMentions,
  serializeMentionField,
} from "../lib/work-item-contacts.ts";

const contacts = [
  { id: "dana", projectId: "project-1", name: "דנה כהן", roleOrCompany: "עורכת דין" },
  { id: "maya", projectId: "project-1", name: "Maya Levi", roleOrCompany: "Lawyer" },
  { id: "dan", projectId: "project-1", name: "Dan Reed", roleOrCompany: "Architect" },
];

test("mention queries support Hebrew roles and do not trigger inside email", () => {
  assert.deepEqual(findMentionQuery("התקשר אל @עורך דין", 18), {
    startOffset: 9,
    endOffset: 18,
    query: "עורך דין",
  });
  assert.equal(findMentionQuery("mail dana@example.com", 17), null);
});

test("role prefixes rank before names and remain stable", () => {
  assert.deepEqual(
    rankMentionContacts(contacts, "law").map((contact) => contact.id),
    ["maya"],
  );
  assert.deepEqual(
    rankMentionContacts(contacts, "דנה").map((contact) => contact.id),
    ["dana"],
  );
});

test("selection inserts a contact id and returns the next caret", () => {
  const result = insertContactMention(
    { text: "Call a @lawyer", mentions: [] },
    { startOffset: 7, endOffset: 14, query: "lawyer" },
    contacts[1],
  );
  assert.equal(result.value.text, "Call a @Maya Levi");
  assert.deepEqual(result.value.mentions, [
    { contactId: "maya", startOffset: 7, endOffset: 17 },
  ]);
  assert.equal(result.caretOffset, 17);
});

test("text edits shift later mentions and unlink an edited mention", () => {
  const value = {
    text: "Call @Maya Levi and @Dan Reed",
    mentions: [
      { contactId: "maya", startOffset: 5, endOffset: 15 },
      { contactId: "dan", startOffset: 20, endOffset: 29 },
    ],
  };
  assert.deepEqual(
    reconcileMentionText(value, "Please call @Maya Levi and @Dan Reed").mentions,
    [
      { contactId: "maya", startOffset: 12, endOffset: 22 },
      { contactId: "dan", startOffset: 27, endOffset: 36 },
    ],
  );
  assert.deepEqual(
    reconcileMentionText(value, "Call @May Levi and @Dan Reed").mentions,
    [{ contactId: "dan", startOffset: 19, endOffset: 28 }],
  );
});

test("manual removal keeps text and current names rewrite ranges safely", () => {
  const removed = removeContactMentions(
    { text: "התקשר אל @דנה", mentions: [{ contactId: "dana", startOffset: 9, endOffset: 13 }] },
    "dana",
  );
  assert.equal(removed.text, "התקשר אל @דנה");
  assert.deepEqual(removed.mentions, []);

  const normalized = normalizeMentionLabels(
    { text: "Call @Dana", mentions: [{ contactId: "dana", startOffset: 5, endOffset: 10 }] },
    [{ ...contacts[0], name: "Dana Cohen" }],
  );
  assert.equal(normalized.text, "Call @Dana Cohen");
  assert.deepEqual(normalized.mentions[0], {
    contactId: "dana",
    startOffset: 5,
    endOffset: 16,
  });
});

test("serialization trims fields and shifts UTF-16 ranges", () => {
  assert.deepEqual(
    serializeMentionField(
      { text: "  Call @דנה  ", mentions: [{ contactId: "dana", startOffset: 7, endOffset: 11 }] },
      "title",
    ),
    {
      text: "Call @דנה",
      mentions: [{ contactId: "dana", field: "title", startOffset: 5, endOffset: 9 }],
    },
  );
});
```

- [ ] **Step 2: Run the pure-model test and confirm the missing module failure**

Run: `node --experimental-strip-types --test tests/work-item-contact-model.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/work-item-contacts.ts`.

- [ ] **Step 3: Add the domain records and mutation input types**

Add these public types to `lib/domain.ts`. Task 3 will add the required arrays to
`WorkItemBase` in the same commit that makes repository snapshots populate
them, so this task leaves every buildable producer intact:

```ts
export type ContactMentionField = "title" | "description";

export type ContactMentionInput = {
  contactId: string;
  field: ContactMentionField;
  startOffset: number;
  endOffset: number;
};

export type WorkItemContactLinkRecord = {
  contactId: string;
  manuallyLinked: boolean;
};

export type WorkItemContactMentionRecord = ContactMentionInput & {
  id: string;
  itemId: string;
};

export type WorkItemContactMutationFields = {
  manualContactIds?: string[];
  contactMentions?: ContactMentionInput[];
};
```

Intersect `WorkItemContactMutationFields` into both task/event variants of `create_item` and `update_item` and into `create_follow_up_task`.

- [ ] **Step 4: Implement the pure mention-value module**

Create `lib/work-item-contacts.ts` with these exact public types and functions:

```ts
import type { ContactMentionField, ContactMentionInput, ContactRecord } from "./domain";

export type MentionRange = Omit<ContactMentionInput, "field">;
export type MentionEditorValue = { text: string; mentions: MentionRange[] };
export type MentionQuery = {
  startOffset: number;
  endOffset: number;
  query: string;
};

export function findMentionQuery(text: string, caretOffset: number): MentionQuery | null;
export function rankMentionContacts<T extends Pick<ContactRecord, "id" | "name" | "roleOrCompany">>(contacts: T[], query: string): T[];
export function insertContactMention(value: MentionEditorValue, query: MentionQuery, contact: Pick<ContactRecord, "id" | "name">): { value: MentionEditorValue; caretOffset: number };
export function reconcileMentionText(value: MentionEditorValue, nextText: string): MentionEditorValue;
export function removeContactMentions(value: MentionEditorValue, contactId: string): MentionEditorValue;
export function normalizeMentionLabels(value: MentionEditorValue, contacts: Pick<ContactRecord, "id" | "name">[]): MentionEditorValue;
export function serializeMentionField(value: MentionEditorValue, field: ContactMentionField): { text: string; mentions: ContactMentionInput[] };
```

Use `normalize("NFKC")`, collapsed whitespace, and locale-insensitive lowercase for matching. Detect the edit span in `reconcileMentionText` with the longest common prefix and suffix; discard every mention intersecting that span and shift every later range by the text-length delta. Sort and deduplicate search results by score, normalized name, then ID. In `serializeMentionField`, trim the field and shift only ranges wholly inside the retained text.

- [ ] **Step 5: Run the pure-model test**

Run: `node --experimental-strip-types --test tests/work-item-contact-model.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the model boundary**

```bash
git add lib/domain.ts lib/work-item-contacts.ts tests/work-item-contact-model.test.mjs
git commit -m "feat: model work item contact mentions"
```

---

### Task 2: Same-project schema and persistence validation

**Files:**
- Modify: `db/schema.ts`
- Modify: `lib/repository.ts`
- Create: `lib/work-item-contact-persistence.ts`
- Generate: `drizzle/0006_work_item_contact_mentions.sql`
- Generate: `drizzle/meta/0006_snapshot.json`
- Modify: `drizzle/meta/_journal.json`
- Modify: `tests/schema-contract.test.mjs`
- Test: `tests/work-item-contact-persistence.test.mjs`

**Interfaces:**
- Consumes: Task 1 `ContactMentionInput`, contact names, item title/description, and D1 prepared statements.
- Produces: `ValidatedWorkItemContactState`, `validateWorkItemContactState`, `WORK_ITEM_CONTACT_INSERT_SQL`, and `WORK_ITEM_CONTACT_MENTION_INSERT_SQL` for repository mutations.

- [ ] **Step 1: Add failing schema and persistence tests**

Extend `tests/schema-contract.test.mjs` with assertions for both tables, both same-project foreign keys, the mention field/offset checks, the project-contact composite unique index, and cascade deletion:

```js
test("work-item contacts and mention occurrences are project constrained", () => {
  assert.match(schema, /export const workItemContacts = sqliteTable/);
  assert.match(schema, /export const workItemContactMentions = sqliteTable/);
  assert.match(migration, /CREATE TABLE `work_item_contacts`/);
  assert.match(migration, /work_item_contacts_item_project_fk/);
  assert.match(migration, /work_item_contacts_contact_project_fk/);
  assert.match(migration, /CREATE TABLE `work_item_contact_mentions`/);
  assert.match(migration, /work_item_contact_mentions_field_check/);
  assert.match(migration, /work_item_contact_mentions_offsets_check/);
});
```

Create `tests/work-item-contact-persistence.test.mjs` and test `validateWorkItemContactState` with a manual contact, repeated Hebrew mentions, an automatic-only contact, a cross-project contact, an overlapping range, and a range whose slice is not the current `@Name`. Assert that the valid result contains one link per contact, with `manuallyLinked: true` only for the manually selected ID.

- [ ] **Step 2: Run the focused tests and confirm failures**

Run: `node --experimental-strip-types --test tests/schema-contract.test.mjs tests/work-item-contact-persistence.test.mjs`

Expected: FAIL because the tables and persistence module do not exist.

- [ ] **Step 3: Add the Drizzle schema**

In `db/schema.ts`, add `project_contacts_id_project_unique` and define the tables with the following keys:

```ts
export const workItemContacts = sqliteTable(
  "work_item_contacts",
  {
    projectId: text("project_id").notNull(),
    itemId: text("item_id").notNull(),
    contactId: text("contact_id").notNull(),
    manuallyLinked: integer("manually_linked", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (table) => [
    primaryKey({ columns: [table.itemId, table.contactId] }),
    uniqueIndex("work_item_contacts_item_contact_project_unique").on(
      table.itemId,
      table.contactId,
      table.projectId,
    ),
    index("work_item_contacts_contact_idx").on(table.contactId, table.itemId),
    foreignKey({
      columns: [table.itemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_contacts_item_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.contactId, table.projectId],
      foreignColumns: [projectContacts.id, projectContacts.projectId],
      name: "work_item_contacts_contact_project_fk",
    }).onDelete("cascade"),
  ],
);

export const workItemContactMentions = sqliteTable(
  "work_item_contact_mentions",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull(),
    itemId: text("item_id").notNull(),
    contactId: text("contact_id").notNull(),
    field: text("field").notNull(),
    startOffset: integer("start_offset").notNull(),
    endOffset: integer("end_offset").notNull(),
  },
  (table) => [
    uniqueIndex("work_item_contact_mentions_range_unique").on(
      table.itemId,
      table.field,
      table.startOffset,
      table.endOffset,
    ),
    index("work_item_contact_mentions_item_idx").on(table.itemId, table.field, table.startOffset),
    foreignKey({
      columns: [table.itemId, table.contactId, table.projectId],
      foreignColumns: [workItemContacts.itemId, workItemContacts.contactId, workItemContacts.projectId],
      name: "work_item_contact_mentions_link_fk",
    }).onDelete("cascade"),
    check("work_item_contact_mentions_field_check", sql`${table.field} IN ('title', 'description')`),
    check("work_item_contact_mentions_offsets_check", sql`${table.startOffset} >= 0 AND ${table.endOffset} > ${table.startOffset}`),
  ],
);
```

Add matching preview DDL and indexes to `PREVIEW_SCHEMA` in `lib/repository.ts`.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate -- --name work_item_contact_mentions`

Expected: Drizzle creates `drizzle/0006_work_item_contact_mentions.sql`, `drizzle/meta/0006_snapshot.json`, and updates `drizzle/meta/_journal.json`. Inspect the SQL and confirm both composite foreign keys use `ON DELETE cascade` and existing tables are not rebuilt unnecessarily.

- [ ] **Step 5: Implement contact-state validation and SQL contracts**

Create `lib/work-item-contact-persistence.ts` with:

```ts
import { DomainError, type ContactMentionInput } from "./domain";

export type ContactIdentity = { id: string; projectId: string; name: string };
export type ValidatedWorkItemContactState = {
  links: { contactId: string; manuallyLinked: boolean }[];
  mentions: ContactMentionInput[];
};

export const WORK_ITEM_CONTACT_INSERT_SQL =
  "INSERT INTO work_item_contacts (project_id,item_id,contact_id,manually_linked) VALUES (?,?,?,?)";
export const WORK_ITEM_CONTACT_MENTION_INSERT_SQL =
  "INSERT INTO work_item_contact_mentions (id,project_id,item_id,contact_id,field,start_offset,end_offset) VALUES (?,?,?,?,?,?,?)";

export function validateWorkItemContactState(input: {
  projectId: string;
  title: string;
  description: string;
  manualContactIds: string[];
  contactMentions: ContactMentionInput[];
  contacts: ContactIdentity[];
}): ValidatedWorkItemContactState;
```

Reject duplicate manual IDs, missing or cross-project contacts, invalid fields, unsafe integers, out-of-bounds ranges, overlapping ranges within a field, and slices unequal to `@${contact.name}`. Sort mentions by field, start, end, and contact ID. Build links from the union of manual and mentioned IDs and set `manuallyLinked` from membership in the manual-ID set.

- [ ] **Step 6: Run the focused persistence tests**

Run: `node --experimental-strip-types --test tests/schema-contract.test.mjs tests/work-item-contact-persistence.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit schema and persistence validation**

```bash
git add db/schema.ts lib/repository.ts lib/work-item-contact-persistence.ts drizzle/0006_work_item_contact_mentions.sql drizzle/meta/0006_snapshot.json drizzle/meta/_journal.json tests/schema-contract.test.mjs tests/work-item-contact-persistence.test.mjs
git commit -m "feat: persist work item contacts"
```

---

### Task 3: Strict mutations, atomic writes, and snapshots

**Files:**
- Modify: `lib/mutations.ts`
- Modify: `lib/repository.ts`
- Modify: `tests/api-contract.test.mjs`
- Modify: `tests/repository-contract.test.mjs`
- Test: `tests/work-item-contact-repository.test.mjs`

**Interfaces:**
- Consumes: Task 1 mutation types and Task 2 `validateWorkItemContactState` plus insert SQL constants.
- Produces: parsed `manualContactIds`/`contactMentions`, atomic create/update/follow-up writes, and snapshot `contactLinks`/`contactMentions` arrays.

- [ ] **Step 1: Add failing strict-parser tests**

Extend `tests/api-contract.test.mjs` so each item action accepts and preserves structured contact inputs:

```js
const contactFields = {
  manualContactIds: ["contact-dana"],
  contactMentions: [
    { contactId: "contact-dana", field: "title", startOffset: 5, endOffset: 10 },
  ],
};

assert.deepEqual(
  parseMutation({
    action: "create_item",
    collectionId: "collection-1",
    type: "task",
    title: "Call @Dana",
    description: "",
    status: "todo",
    dueDate: null,
    estimatedCostMinor: null,
    ...contactFields,
  }),
  {
    action: "create_item",
    collectionId: "collection-1",
    type: "task",
    title: "Call @Dana",
    description: "",
    status: "todo",
    dueDate: null,
    estimatedCostMinor: null,
    ...contactFields,
  },
);
```

Also assert omitted arrays normalize to `[]`, mention objects reject unknown keys, offsets reject negative/fractional values, duplicate manual IDs reject, and a non-array input rejects. Repeat one accepted case for `update_item` and `create_follow_up_task`.

- [ ] **Step 2: Add failing repository and snapshot tests**

Extend `tests/repository-contract.test.mjs` to assert the snapshot loads project-scoped link and mention rows and maps empty arrays. Create `tests/work-item-contact-repository.test.mjs` as a source-and-helper contract that asserts each create/update/follow-up case calls `validateWorkItemContactState`, uses `db.batch`, deletes old links before reinsertion on update, and returns mention/contact rows in stable order.

- [ ] **Step 3: Run focused API and repository tests**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs tests/repository-contract.test.mjs tests/work-item-contact-repository.test.mjs`

Expected: FAIL because mutation parsing and repository integration are absent.

- [ ] **Step 4: Parse contact fields once for every item action**

In `lib/mutations.ts`, add strict helpers:

```ts
function contactIdArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new DomainError("Manual contacts must be an array");
  const result = value.map((entry) => id(entry, "Contact"));
  if (new Set(result).size !== result.length) {
    throw new DomainError("Manual contacts must not contain duplicates");
  }
  return result;
}

function contactMentionArray(value: unknown): ContactMentionInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new DomainError("Contact mentions must be an array");
  return value.map((entry) => {
    const mention = object(entry);
    rejectUnknown(mention, ["contactId", "field", "startOffset", "endOffset"]);
    if (mention.field !== "title" && mention.field !== "description") {
      throw new DomainError("Contact mention field must be title or description");
    }
    if (!Number.isSafeInteger(mention.startOffset) || !Number.isSafeInteger(mention.endOffset)) {
      throw new DomainError("Contact mention offsets must be integers");
    }
    return {
      contactId: id(mention.contactId, "Contact"),
      field: mention.field,
      startOffset: Number(mention.startOffset),
      endOffset: Number(mention.endOffset),
    };
  });
}
```

Add `manualContactIds` and `contactMentions` to the allowed keys for all five task/event create/update variants and the follow-up action, and always return normalized arrays.

- [ ] **Step 5: Load links and mentions into every snapshot item**

In `loadWorkspaceSnapshot`, query both tables through `project_members current`, ordered by item, field, and start offset. Build maps keyed by `item_id` and include:

First add the required arrays to `WorkItemBase` in `lib/domain.ts`:

```ts
contactLinks: WorkItemContactLinkRecord[];
contactMentions: WorkItemContactMentionRecord[];
```

```ts
contactLinks: contactLinksByItem.get(row.id) ?? [],
contactMentions: contactMentionsByItem.get(row.id) ?? [],
```

Map `manually_linked` with `Boolean(row.manually_linked)` and include generated mention IDs without duplicating contact details.

- [ ] **Step 6: Save each item and its contact state atomically**

In `applyWorkspaceMutation`, resolve the project and load its `{ id, project_id, name }` contacts before calling `validateWorkItemContactState`. Generate the item ID before preparing create statements. Add a repository helper with this contract:

```ts
function appendContactStateStatements(
  statements: D1PreparedStatement[],
  db: D1Database,
  input: {
    itemId: string;
    projectId: string;
    state: ValidatedWorkItemContactState;
    replace: boolean;
  },
): void;
```

When `replace` is true, append `DELETE FROM work_item_contacts WHERE item_id = ?` first; its cascade removes old occurrences. Append one link insert per validated link and one mention insert with `crypto.randomUUID()` per occurrence. Execute the work-item statement, link statements, mention statements, and the follow-up relation statement when applicable in one `db.batch(statements)` call. Preserve `createdItemId` behavior for follow-up tasks.

- [ ] **Step 7: Run the focused mutation/repository tests**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs tests/repository-contract.test.mjs tests/work-item-contact-repository.test.mjs tests/work-item-contact-persistence.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit the mutation and snapshot flow**

```bash
git add lib/mutations.ts lib/repository.ts tests/api-contract.test.mjs tests/repository-contract.test.mjs tests/work-item-contact-repository.test.mjs
git commit -m "feat: save contacts with work items"
```

---

### Task 4: Archive export, validation, and ID remapping

**Files:**
- Modify: `lib/project-archive.ts`
- Modify: `lib/project-transfer.ts`
- Modify: `lib/project-transfer-repository.ts`
- Modify: `tests/project-archive.test.mjs`
- Modify: `tests/project-archive-zip.test.mjs`
- Modify: `tests/project-transfer-repository.test.mjs`
- Modify: `tests/project-transfer-routes.test.mjs`

**Interfaces:**
- Consumes: Task 2 persistence schema, Task 3 repository records, existing archive version 1, and import ID maps.
- Produces: optional legacy-compatible `itemContacts` and `contactMentions` manifest arrays, stable export ordering, and remapped import statements.

- [ ] **Step 1: Add failing archive model and validation tests**

Extend the `validManifest()` fixture in `tests/project-archive.test.mjs` with:

```js
itemContacts: [
  { itemId: "task-1", contactId: "contact-1", manuallyLinked: true },
],
contactMentions: [
  {
    itemId: "task-1",
    contactId: "contact-1",
    field: "title",
    startOffset: 8,
    endOffset: 19,
  },
],
```

Change the item title to `Approve @Dana Cohen plans` and use
`startOffset: 8, endOffset: 19` for `@Dana Cohen`. Assert parsing succeeds;
omitted arrays become empty; duplicate item/contact links, mention overlaps,
unknown item/contact IDs, cross-link mentions, invalid offsets, and mismatched
`@Name` slices reject.

- [ ] **Step 2: Add failing export/import remapping tests**

In `tests/project-transfer-repository.test.mjs`, assert `loadProjectArchiveSource` queries both tables by project, `createImportIdPlan` remaps their item/contact IDs, and persistence inserts links before mentions in the single D1 batch. Update route and ZIP fixtures so deterministic archives include the new arrays.

- [ ] **Step 3: Run focused archive tests**

Run: `node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs`

Expected: FAIL because the manifest rejects the new top-level fields and transfer code omits them.

- [ ] **Step 4: Extend the version-1 manifest with legacy-optional arrays**

Add these exact archive types and fields to `lib/project-archive.ts`:

```ts
export type ProjectArchiveItemContact = {
  itemId: string;
  contactId: string;
  manuallyLinked: boolean;
};

export type ProjectArchiveContactMention = {
  itemId: string;
  contactId: string;
  field: ContactMentionField;
  startOffset: number;
  endOffset: number;
};

itemContacts: ProjectArchiveItemContact[];
contactMentions: ProjectArchiveContactMention[];
```

Append those two required normalized fields to the existing
`ProjectArchiveManifestV1` type.

Permit both top-level keys, parse omitted values as `[]`, reject unknown nested fields, and reuse `validateWorkItemContactState` per item after the existing reference sets are built. Archive validation must require every mention to have a corresponding item-contact link and must preserve the stored `manuallyLinked` value.
Pass a sentinel `projectId: "archive"` for the item and every archived contact
when reusing the validator, then compare its derived links with the manifest's
links for that item. This rejects an automatic-only link that has no mention as
well as a mentioned contact missing its link.

- [ ] **Step 5: Export and import links in stable order**

Update `ProjectArchiveSource` and `loadProjectArchiveSource` to query item contacts ordered by `item_id, contact_id` and mentions ordered by `item_id, field, start_offset, end_offset, contact_id`. Return both arrays in the manifest source.

Update `createProjectTransferService` in `lib/project-transfer.ts` to pass
`source.itemContacts` and `source.contactMentions` into the manifest object
before `parseProjectArchiveManifest` validates and encodes it.

Extend `PlannedProjectImport` with remapped `itemContacts` and `contactMentions`. Map IDs through `plan.itemIds` and `plan.contactIds`, generate new mention IDs only when building persistence statements, and append link inserts before mention inserts. The existing `db.batch(statements)` remains the only D1 import write.

- [ ] **Step 6: Run focused archive tests**

Run: `node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs`

Expected: PASS.

- [ ] **Step 7: Commit archive compatibility**

```bash
git add lib/project-archive.ts lib/project-transfer.ts lib/project-transfer-repository.ts tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs
git commit -m "feat: archive work item contacts"
```

---

### Task 5: Saved mention rendering and contact actions

**Files:**
- Create: `app/components/contact-actions.tsx`
- Create: `app/components/mention-text.tsx`
- Modify: `app/components/work-item-title.tsx`
- Test: `tests/contact-mention-rendering.test.mjs`

**Interfaces:**
- Consumes: Task 1 mention records, top-level `ContactRecord` data, and existing `Modal`.
- Produces: `ContactActionTrigger`, `ContactDetailsModal`, `MentionText`, and a `WorkItemTitle` that receives `contacts` and renders exact title ranges.

- [ ] **Step 1: Add failing server-render and component-contract tests**

Create `tests/contact-mention-rendering.test.mjs`. Render `MentionText` through `react-dom/server` with Hebrew surrounding text, one current contact, and one deleted-contact range. Assert valid ranges render an isolated `button` labelled `@דנה כהן`, ordinary segments retain `dir="auto"`, deleted metadata falls back to text, and the action component contains `tel:`/`mailto:` only when fields exist. Add source assertions for Escape handling, outside-click cleanup, `stopPropagation`, and a read-only contact detail modal.

- [ ] **Step 2: Run the rendering test and confirm missing modules**

Run: `node --experimental-strip-types --test tests/contact-mention-rendering.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for the new components.

- [ ] **Step 3: Implement the shared contact action trigger**

Create `app/components/contact-actions.tsx` as a client component with:

```tsx
export declare function ContactActionTrigger({
  contact,
  label,
  className,
}: {
  contact: ContactRecord;
  label: ReactNode;
  className?: string;
}): ReactElement;

export declare function ContactDetailsModal({
  contact,
  open,
  onClose,
}: {
  contact: ContactRecord;
  open: boolean;
  onClose: () => void;
}): ReactElement | null;
```

The trigger must be a real button, call `preventDefault()` and `stopPropagation()`, close on Escape/outside click, return focus to its trigger, and render `tel:${contact.phone}` and `mailto:${contact.email}` only for present details. Wrap mixed-direction labels/details in `bdi dir="auto"`.

- [ ] **Step 4: Implement range-based mention rendering**

Create `app/components/mention-text.tsx` with:

```tsx
export declare function MentionText({
  text,
  field,
  mentions,
  contacts,
}: {
  text: string;
  field: ContactMentionField;
  mentions: WorkItemContactMentionRecord[];
  contacts: ContactRecord[];
}): ReactElement;
```

Validate ranges defensively before slicing. When the contact or range is invalid, render the stored slice as plain text. For a valid mention, display the current `@${contact.name}` in a bidi-isolated trigger. Never infer a contact by matching visible text.

Update `WorkItemTitle` to accept:

```ts
item: Pick<WorkItemRecord, "title" | "files" | "contactMentions">;
contacts?: ContactRecord[];
```

Default `contacts` to `[]` so this task remains buildable before Task 7 updates
every caller. Replace raw `{item.title}` with `MentionText field="title"` while
preserving the attachment indicator.

- [ ] **Step 5: Run the rendering tests**

Run: `node --experimental-strip-types --test tests/contact-mention-rendering.test.mjs tests/attachment-indicator-contract.test.mjs`

Expected: PASS; the transitional optional `contacts` prop keeps existing title
callers valid until Task 7 supplies the real workspace contacts.

- [ ] **Step 6: Commit saved rendering and actions**

```bash
git add app/components/contact-actions.tsx app/components/mention-text.tsx app/components/work-item-title.tsx tests/contact-mention-rendering.test.mjs
git commit -m "feat: render interactive contact mentions"
```

---

### Task 6: Mention editor and manual contact selector

**Files:**
- Create: `app/components/contact-mention-editor.tsx`
- Create: `app/components/work-item-contact-selector.tsx`
- Test: `tests/contact-mention-editor.test.mjs`

**Interfaces:**
- Consumes: Task 1 pure helpers, Task 5 `ContactActionTrigger`, project-scoped `ContactRecord[]`, and controlled React state.
- Produces: `ContactMentionEditor` and `WorkItemContactSelector` for the item Details form.

- [ ] **Step 1: Add failing editor contract tests**

Create `tests/contact-mention-editor.test.mjs` with source and server-render assertions for:

- `role="textbox"`, `contentEditable`, `dir="auto"`, and `aria-multiline` variants;
- a `role="combobox"`/`role="listbox"` picker using `aria-activedescendant`;
- Arrow Up, Arrow Down, Enter, Escape, Backspace, Delete, paste, and composition-event branches;
- project-scoped name/role result labels wrapped in bidi isolation;
- `No matching contacts`;
- a controlled `manualContactIds` set and deduplicated linked chips; and
- removing a contact calls `removeContactMentions` while leaving visible text.

- [ ] **Step 2: Run the editor test and confirm missing modules**

Run: `node --experimental-strip-types --test tests/contact-mention-editor.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the controlled mention editor**

Create `ContactMentionEditor` with this public contract:

```tsx
export declare function ContactMentionEditor({
  label,
  value,
  contacts,
  multiline,
  maxLength,
  onChange,
}: {
  label: string;
  value: MentionEditorValue;
  contacts: ContactRecord[];
  multiline: boolean;
  maxLength: number;
  onChange: (value: MentionEditorValue) => void;
}): ReactElement;
```

Render text as structured plain segments and `contentEditable={false}` mention
tokens backed by `ContactActionTrigger`, with the contact ID also stored in
`data-contact-id` for serialization. Read the DOM back into
`MentionEditorValue` on input; use `reconcileMentionText` only when the browser
produces plain-text edits. Do not open or mutate the picker while
`compositionstart`/`compositionend` indicates active composition. Enforce 160
UTF-16 units for title and 4,000 for description before emitting state. On
paste, insert `text/plain` only. Calculate the picker anchor from the current
DOM `Range`; fall back to the editor's lower edge when no range rectangle
exists.

Keyboard behavior must remove a whole mention when Backspace/Delete targets its boundary, move the active picker option with arrows, select with Enter, and close with Escape without discarding typed text.

- [ ] **Step 4: Implement manual contact selection and chips**

Create `WorkItemContactSelector` with:

```tsx
export declare function WorkItemContactSelector({
  contacts,
  manualContactIds,
  mentionedContactIds,
  onManualContactIdsChange,
  onRemoveContact,
}: {
  contacts: ContactRecord[];
  manualContactIds: string[];
  mentionedContactIds: string[];
  onManualContactIdsChange: (ids: string[]) => void;
  onRemoveContact: (contactId: string) => void;
}): ReactElement;
```

Show the deduplicated union of manual and mentioned IDs. Adding through this selector adds only to `manualContactIds`. Removing any chip calls `onRemoveContact`, which removes the ID from manual state and strips all mention metadata from both fields while preserving text. Each chip uses `ContactActionTrigger` and shows current name plus role/company.

- [ ] **Step 5: Run the editor tests**

Run: `node --experimental-strip-types --test tests/contact-mention-editor.test.mjs tests/work-item-contact-model.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the editing controls**

```bash
git add app/components/contact-mention-editor.tsx app/components/work-item-contact-selector.tsx tests/contact-mention-editor.test.mjs
git commit -m "feat: edit contact mentions"
```

---

### Task 7: Item-sheet integration and interactive dashboard surfaces

**Files:**
- Create: `app/components/work-item-open-surface.tsx`
- Modify: `app/components/item-sheet.tsx`
- Modify: `app/components/dashboards.tsx`
- Modify: `app/components/project-workspace.tsx`
- Modify: `app/globals.css`
- Modify: `tests/dashboard-contract.test.mjs`
- Modify: `tests/rendered-html.test.mjs`
- Modify: `tests/workflow-contract.test.mjs`
- Test: `tests/work-item-contact-ui.test.mjs`

**Interfaces:**
- Consumes: Tasks 1, 3, 5, and 6 components/types; existing `ItemSheet`, `WorkItemTitle`, dashboard rows, and project collection rows.
- Produces: contact-aware create/edit/follow-up flows, interactive descriptions, legal non-nested row interactions, and responsive Hebrew/mixed-direction styling.

- [ ] **Step 1: Add failing item-sheet and dashboard integration tests**

Create `tests/work-item-contact-ui.test.mjs` with source assertions that `ItemSheetContent` initializes title/description mention values from existing item records, filters contacts by `project.id`, renders both `ContactMentionEditor` variants and `WorkItemContactSelector`, serializes both fields into one mutation, and supplies `manualContactIds`/combined `contactMentions` for create, update, and follow-up actions.

Add rendered/source assertions that every `WorkItemTitle` call receives `contacts={snapshot.contacts}`, title mention triggers are not nested inside a `<button>`, description mentions expose contact actions in the open Details form, Hebrew examples use `dir="auto"`/`bdi`, and mention buttons stop row opening.

- [ ] **Step 2: Run the focused UI tests and confirm failures**

Run: `node --experimental-strip-types --test tests/work-item-contact-ui.test.mjs tests/dashboard-contract.test.mjs tests/rendered-html.test.mjs tests/workflow-contract.test.mjs`

Expected: FAIL because the item sheet and dashboard surfaces still use plain fields and button wrappers.

- [ ] **Step 3: Integrate controlled contact state into ItemSheet**

In `ItemSheetContent`, compute project contacts once and initialize:

```ts
const [titleValue, setTitleValue] = useState<MentionEditorValue>(() =>
  normalizeMentionLabels(valueForField(item, "title"), projectContacts),
);
const [descriptionValue, setDescriptionValue] = useState<MentionEditorValue>(() =>
  normalizeMentionLabels(valueForField(item, "description"), projectContacts),
);
const [manualContactIds, setManualContactIds] = useState<string[]>(() =>
  item?.contactLinks.filter((link) => link.manuallyLinked).map((link) => link.contactId) ?? [],
);
```

Replace the native title and description controls with `ContactMentionEditor`. Add `WorkItemContactSelector` below them. When a chip is removed, clear that ID from manual state and call `removeContactMentions` for both editor values.

On submit, call `serializeMentionField` for title and description, use their normalized text in `common`, and include:

```ts
manualContactIds,
contactMentions: [...title.mentions, ...description.mentions],
```

Apply the same payload to new task/event, existing task/event, and follow-up task branches. Project contacts are `snapshot.contacts.filter(contact => contact.projectId === project?.id)`; no aggregate or cross-project results enter either control.

- [ ] **Step 4: Replace nested row buttons with an overlay open surface**

Create `WorkItemOpenSurface`:

```tsx
export declare function WorkItemOpenSurface({
  as = "div",
  className,
  label,
  onOpen,
  children,
}: {
  as?: "div" | "article";
  className: string;
  label: string;
  onOpen: () => void;
  children: ReactNode;
}): ReactElement;
```

Render a real `.work-item-open-target` button as the first child and keep each
visual child directly in the wrapper so existing grid layouts retain their
columns. The target fills the wrapper and provides keyboard activation. Give
the other direct children a higher stacking level and disabled pointer events;
restore pointer events only on mention buttons. No button or link is nested
inside another button.

Use this surface for TaskRow, EventRow, Timeline agenda/month entries, Spending item rows, and project collection task/event rows. Preserve existing class names and layout semantics. Payment-feed rows that show plain payment/item text remain unchanged.

- [ ] **Step 5: Pass contacts to every title renderer**

Update all dashboard and project calls to:

```tsx
<WorkItemTitle item={item} contacts={snapshot.contacts} />
```

Use `task` or `event` in project collection mappings. Confirm Overview, Tasks, Events, Timeline agenda/month/week, Spending, and project collections all flow through the shared renderer.

- [ ] **Step 6: Add responsive mention, picker, chip, popover, and row-surface styles**

In `app/globals.css`, add focused rules for:

```css
.mention-editor { position: relative; }
.mention-editor-input { min-height: 44px; white-space: pre-wrap; unicode-bidi: plaintext; }
.mention-editor-input[aria-multiline="true"] { min-height: 104px; }
.contact-mention, .contact-chip-name { unicode-bidi: isolate; }
.mention-picker { position: fixed; z-index: 140; max-width: min(360px, calc(100vw - 24px)); }
.contact-action-popover { position: absolute; z-index: 150; }
.work-item-open-surface { position: relative; }
.work-item-open-target { position: absolute; inset: 0; z-index: 0; }
.work-item-open-surface > :not(.work-item-open-target) { position: relative; z-index: 1; pointer-events: none; }
.work-item-open-surface .contact-mention { pointer-events: auto; }
```

Match existing colors, borders, focus rings, 44px touch targets, and mobile sheet widths. Ensure `:dir(rtl)` rules position picker text and contact metadata correctly without reversing phone/email glyph order.

- [ ] **Step 7: Run focused UI and existing dashboard tests**

Run: `node --experimental-strip-types --test tests/work-item-contact-ui.test.mjs tests/contact-mention-editor.test.mjs tests/contact-mention-rendering.test.mjs tests/dashboard-contract.test.mjs tests/rendered-html.test.mjs tests/workflow-contract.test.mjs tests/attachment-indicator-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: PASS.

- [ ] **Step 8: Commit end-to-end UI integration**

```bash
git add app/components/work-item-open-surface.tsx app/components/item-sheet.tsx app/components/dashboards.tsx app/components/project-workspace.tsx app/globals.css tests/work-item-contact-ui.test.mjs tests/dashboard-contract.test.mjs tests/rendered-html.test.mjs tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs
git commit -m "feat: link contacts from tasks and events"
```

---

### Task 8: Full verification, Hebrew QA, and publication

**Files:**
- Modify: `README.md`
- Verify: all files changed in Tasks 1–7

**Interfaces:**
- Consumes: completed persistence, archives, editors, contact actions, and dashboard integrations.
- Produces: documented, fully verified branch and a draft pull request.

- [ ] **Step 1: Document the completed product shape**

Update the README Product Shape bullet for work items to say that tasks and events support project-contact links and inline contact mentions with native call/email actions. Add no implementation details or screenshots.

- [ ] **Step 2: Run all focused contact-mention tests together**

Run:

```bash
node --experimental-strip-types --test \
  tests/work-item-contact-model.test.mjs \
  tests/work-item-contact-persistence.test.mjs \
  tests/work-item-contact-repository.test.mjs \
  tests/contact-mention-rendering.test.mjs \
  tests/contact-mention-editor.test.mjs \
  tests/work-item-contact-ui.test.mjs \
  tests/project-archive.test.mjs \
  tests/project-transfer-repository.test.mjs
```

Expected: PASS with zero failed, cancelled, or skipped tests.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Expected: exit 0 with no ESLint errors.

- [ ] **Step 4: Run the complete build and test suite**

Run: `npm test`

Expected: the production build validates and every `tests/*.test.mjs` test passes.

- [ ] **Step 5: Apply the migration to the local D1 state**

Run: `npm run dev:setup`

Expected: migration `0006_work_item_contact_mentions.sql` applies successfully or reports it was already applied.

- [ ] **Step 6: Perform desktop browser verification**

Run `npm run dev`, open the printed local URL, and verify:

1. Create a task titled `Call a @lawyer`; confirm a role match selects the intended contact and saves `@Name`.
2. Mention multiple contacts in title and description; confirm the contacts list is deduplicated.
3. Add one contact manually, delete its mention, and confirm its chip remains.
4. Add one contact only through a mention, delete its last mention, and confirm its chip disappears.
5. Remove a contact chip and confirm its visible mention text remains but becomes noninteractive.
6. Activate a title mention from Tasks, Events, Timeline, Overview, Spending, and a project collection without opening the item row.
7. Confirm Call and Email delegate to `tel:` and `mailto:`, View contact is read-only, and absent details hide only their actions.

- [ ] **Step 7: Perform Hebrew and mobile browser verification**

At a mobile width and desktop width, create and edit:

- `התקשרי אל @דנה כהן`;
- `Call @דנה כהן regarding the contract`; and
- `להתקשר אל @Dana Cohen לגבי החוזה`.

Confirm caret movement, selection, picker anchoring, keyboard navigation, punctuation, phone numbers, email addresses, chip wrapping, popover placement, and focus restoration are correct in both directions.

- [ ] **Step 8: Review the final diff and commit documentation/fixes**

Run: `git diff --check` and `git status --short`.

Expected: no whitespace errors and only intentional files. Commit any README or QA corrections:

```bash
git add README.md app lib db drizzle tests
git commit -m "docs: document contact mentions"
```

If QA required no changes and README was already committed with an earlier coherent change, do not create an empty commit.

- [ ] **Step 9: Push the feature branch and open a draft pull request**

Use the repository's required GitHub publishing workflow to push `feature/work-item-contact-mentions` and open a draft PR. The PR body must summarize structured/manual linking, Hebrew mention search and bidi handling, quick actions, persistence/archive compatibility, and the exact verification commands and browser scenarios completed.

- [ ] **Step 10: Return to main only after merge confirmation**

After the pull request is confirmed merged, run:

```bash
git switch main
git pull --rebase
```

Expected: local `main` matches the merged remote history.
