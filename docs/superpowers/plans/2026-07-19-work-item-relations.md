# Work Item Relations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add same-project relationships between tasks and events and let an event create an atomically linked follow-up task.

**Architecture:** Keep the existing task/event discriminated union and `work_items` table. Add normalized relation domain contracts and a `work_item_relations` table, enforce authorization and graph invariants in the repository, include relations in workspace snapshots, and extend the existing item sheet with relation management and follow-up creation.

**Tech Stack:** TypeScript 5.9, React 19, Next/Vinext, Cloudflare D1, Drizzle ORM, Node test runner, ESLint.

## Global Constraints

- Tasks and events remain distinct and cannot be converted.
- Relations connect items in the same project only.
- Relation types are exactly `follows_from`, `blocks`, and `related_to`.
- `blocks` connects tasks only; directed relations reject transitive cycles.
- `related_to` is symmetric and stored in canonical item-ID order.
- Follow-up creation copies no event content and creates the task and relation atomically.
- Removing a relation never removes either item.
- Existing work items require no backfill; snapshots return `relations: []` when none exist.

---

### Task 1: Domain and mutation contracts

**Files:**
- Modify: `lib/domain.ts`
- Modify: `lib/mutations.ts`
- Test: `tests/domain.test.mjs`
- Test: `tests/api-contract.test.mjs`

**Interfaces:**
- Produces: `RelationType`, `WorkItemRelationRecord`, `normalizeRelationEndpoints(type, sourceItemId, targetItemId)`, and new `WorkspaceMutation` variants.
- Consumes: existing `DomainError`, `requireText`, date, status, and money validators.

- [ ] **Step 1: Write failing domain and parser tests**

Add tests equivalent to:

```ts
assert.deepEqual(
  normalizeRelationEndpoints("related_to", "item-z", "item-a"),
  { sourceItemId: "item-a", targetItemId: "item-z" },
);
assert.throws(
  () => normalizeRelationEndpoints("blocks", "item-a", "item-a"),
  /cannot relate an item to itself/i,
);

assert.deepEqual(parseMutation({
  action: "create_relation",
  sourceItemId: "event-1",
  targetItemId: "task-1",
  relationType: "follows_from",
}), {
  action: "create_relation",
  sourceItemId: "event-1",
  targetItemId: "task-1",
  relationType: "follows_from",
});

assert.deepEqual(parseMutation({
  action: "create_follow_up_task",
  sourceEventId: "event-1",
  collectionId: "collection-1",
  title: "Pay the Ministry of Housing voucher",
  description: "",
  status: "todo",
  dueDate: null,
  estimatedCostMinor: null,
}).action, "create_follow_up_task");
```

Also assert rejection of unknown relation types, self-relations, extra fields,
and missing IDs.

- [ ] **Step 2: Run focused tests and confirm the new imports fail**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/api-contract.test.mjs`

Expected: FAIL because relation contracts do not exist.

- [ ] **Step 3: Add relation types, normalization, snapshot data, and mutation variants**

Add these contracts to `lib/domain.ts`:

```ts
export type RelationType = "follows_from" | "blocks" | "related_to";

export type WorkItemRelationRecord = {
  id: string;
  projectId: string;
  sourceItemId: string;
  targetItemId: string;
  type: RelationType;
  createdBy: string;
  createdAt: string;
};

export function validateRelationType(value: unknown): RelationType {
  if (value === "follows_from" || value === "blocks" || value === "related_to") return value;
  throw new DomainError("invalid relationship type");
}

export function normalizeRelationEndpoints(
  type: RelationType,
  sourceItemId: string,
  targetItemId: string,
): { sourceItemId: string; targetItemId: string } {
  if (sourceItemId === targetItemId) {
    throw new DomainError("Cannot relate an item to itself");
  }
  if (type === "related_to" && sourceItemId > targetItemId) {
    return { sourceItemId: targetItemId, targetItemId: sourceItemId };
  }
  return { sourceItemId, targetItemId };
}
```

Add `relations: WorkItemRelationRecord[]` to `WorkspaceSnapshot`. Add mutation
variants for `create_relation`, `delete_relation`, and
`create_follow_up_task` with the exact fields exercised by the tests.

- [ ] **Step 4: Parse and strictly validate all new mutations**

Use `rejectUnknown`, `id`, `validateRelationType`, `validateTaskStatus`,
`validateOptionalIsoDate`, and `estimate` in `lib/mutations.ts`. Normalize
`related_to` endpoints before returning `create_relation`.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/api-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit the domain checkpoint**

```bash
git add lib/domain.ts lib/mutations.ts tests/domain.test.mjs tests/api-contract.test.mjs
git commit -m "feat: add work item relation contracts"
```

---

### Task 2: Persistence, graph validation, and atomic follow-up creation

**Files:**
- Modify: `db/schema.ts`
- Modify: `lib/repository.ts`
- Create: `drizzle/0001_work_item_relations.sql`
- Modify: `drizzle/meta/_journal.json`
- Create: `drizzle/meta/0001_snapshot.json`
- Test: `tests/schema-contract.test.mjs`
- Test: `tests/repository-contract.test.mjs`

**Interfaces:**
- Consumes: Task 1 relation records and mutations.
- Produces: snapshots populated with `relations`; persisted create/delete relation operations; atomic `create_follow_up_task`.

- [ ] **Step 1: Write failing schema and repository contract tests**

Assert that generated migrations contain `work_item_relations`, project-scoped
foreign keys, the relation-type and self-link checks, and a uniqueness
constraint. Assert repository source contains:

```ts
case "create_relation"
case "delete_relation"
case "create_follow_up_task"
WITH RECURSIVE
```

Also assert that the follow-up branch batches exactly one task insert and one
`follows_from` insert after validating the source event and collection project.

- [ ] **Step 2: Run the focused tests and confirm failure**

Run: `node --experimental-strip-types --test tests/schema-contract.test.mjs tests/repository-contract.test.mjs`

Expected: FAIL because the table and repository cases are absent.

- [ ] **Step 3: Define the relation table and indexes**

Add a unique `(id, project_id)` index to `work_items`. Define
`workItemRelations` with composite foreign keys to both item endpoints, checks,
and indexes equivalent to:

```ts
uniqueIndex("work_item_relations_unique").on(
  table.projectId,
  table.type,
  table.sourceItemId,
  table.targetItemId,
),
check("work_item_relations_type_check",
  sql`${table.type} IN ('follows_from', 'blocks', 'related_to')`),
check("work_item_relations_distinct_items_check",
  sql`${table.sourceItemId} <> ${table.targetItemId}`),
```

Add the equivalent table and indexes to `PREVIEW_SCHEMA` so local development
databases expose the same model.

- [ ] **Step 4: Generate and inspect the migration**

Run: `npm run db:generate -- --name work_item_relations`

Expected: a new migration and Drizzle metadata containing only the new unique
index and relation table/indexes; existing work-item rows are not rebuilt or
changed.

- [ ] **Step 5: Load authorized relationships into snapshots**

Query relations by joining `project_members` on `project_id`, map snake-case
rows to `WorkItemRelationRecord`, and return `relations` beside `items`. Preview
seed snapshots must naturally return an empty array until links are created.

- [ ] **Step 6: Implement repository invariants**

Create focused helpers:

```ts
type ItemRelationContext = {
  id: string;
  projectId: string;
  type: "task" | "event";
};

async function relationItem(itemId: string): Promise<ItemRelationContext>;
async function assertNoRelationCycle(
  projectId: string,
  type: "follows_from" | "blocks",
  sourceItemId: string,
  targetItemId: string,
): Promise<void>;
```

`assertNoRelationCycle` uses a recursive CTE starting at `targetItemId` and
throws `DomainError("Relationship would create a cycle", "conflict")` if the
source is reachable. `create_relation` verifies access, project equality,
task-only blocking, canonical endpoints, cycle safety, and converts unique
constraint failures to a duplicate-relation conflict. `delete_relation`
authorizes through the stored project and deletes only that row.

- [ ] **Step 7: Implement atomic follow-up task creation**

Validate that `sourceEventId` resolves to an event and the selected collection
belongs to its project. Generate task and relation IDs, then call `db.batch`
with an `INSERT work_items ... 'task'` statement and an
`INSERT work_item_relations ... 'follows_from'` statement. Return the refreshed
snapshot only after both statements succeed.

- [ ] **Step 8: Run persistence-focused and existing domain tests**

Run: `node --experimental-strip-types --test tests/schema-contract.test.mjs tests/repository-contract.test.mjs tests/domain.test.mjs tests/api-contract.test.mjs`

Expected: PASS.

- [ ] **Step 9: Commit the persistence checkpoint**

```bash
git add db/schema.ts lib/repository.ts drizzle tests/schema-contract.test.mjs tests/repository-contract.test.mjs
git commit -m "feat: persist work item relationships"
```

---

### Task 3: Relationship and follow-up task interactions

**Files:**
- Modify: `app/components/item-sheet.tsx`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/workflow-contract.test.mjs`
- Modify: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Consumes: relation snapshot records and mutations from Tasks 1–2.
- Produces: item relation browsing/management, linked-item navigation, and event follow-up task creation.

- [ ] **Step 1: Write failing interaction contract tests**

Assert the item sheet contains the labels and actions:

```ts
for (const label of [
  "Relations",
  "Create follow-up task",
  "Follow-up items",
  "Follows from",
  "Blocks",
  "Blocked by",
  "Related items",
  "Add relationship",
  "Remove relationship",
]) assert.match(itemSource, new RegExp(label));
```

Assert it submits `create_follow_up_task`, `create_relation`, and
`delete_relation`, accepts an `onOpenItem` callback, and uses ordinary labeled
controls reachable on mobile.

- [ ] **Step 2: Run interaction tests and confirm failure**

Run: `node --experimental-strip-types --test tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: FAIL because the relation UI is absent.

- [ ] **Step 3: Extend item-sheet mode and navigation**

Represent follow-up creation explicitly:

```ts
export type ItemSheetMode =
  | { kind: "new"; type: "task" | "event"; collectionId: string }
  | { kind: "follow-up"; sourceEventId: string; collectionId: string }
  | { kind: "existing"; itemId: string }
  | null;
```

Pass `onOpenItem` from `HarborApp` to `ItemSheet`. When a linked item is opened,
replace the sheet mode with its item ID. After a successful follow-up mutation,
compare old/new item IDs and open the created task.

- [ ] **Step 4: Add event follow-up creation**

Place **Create follow-up task** in an existing event's Details actions. The
follow-up form shows `Follows from <event title>`, defaults to the same
collection, lets the user choose another collection in that project, and keeps
all task content fields blank with status `todo`. Submit
`create_follow_up_task`; do not reuse `update_item` or change event type.

- [ ] **Step 5: Add the Relations tab and relation grouping**

Add a fourth tab. For the open item, derive groups using relation direction:

```ts
const outgoing = relation.sourceItemId === item.id;
// follows_from: outgoing => Follow-up items; incoming => Follows from
// blocks: outgoing => Blocks; incoming => Blocked by
// related_to: always Related items
```

Render linked type, title, collection, and status/date. Provide an open button
and an explicitly labeled remove button for each relation.

- [ ] **Step 6: Add relation creation controls**

Offer directional meanings appropriate to the current item: follow-up item,
follows from, blocks, blocked by, and related item. Restrict block choices to
tasks and filter the item picker to the same project, excluding self and already
represented source/type/target triples. Translate inverse UI meanings by
swapping source and target IDs before submitting `create_relation`.

- [ ] **Step 7: Style desktop and mobile states**

Add focused classes for relation groups, rows, type chips, source context, and
the add form. Follow existing card, one-pixel border, cyan/seafoam, and mobile
full-sheet patterns. At narrow widths, stack relation metadata and actions with
44px minimum-height controls; do not hide any operation.

- [ ] **Step 8: Run focused interaction tests, lint, and type/build checks**

Run:

```bash
node --experimental-strip-types --test tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs
npm run lint
npm run build
```

Expected: all commands PASS.

- [ ] **Step 9: Commit the interaction checkpoint**

```bash
git add app/components/item-sheet.tsx app/components/harbor-app.tsx app/globals.css tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs
git commit -m "feat: add work item relation workflows"
```

---

### Task 4: Full verification and pull-request readiness

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Consumes: complete feature from Tasks 1–3.
- Produces: verified branch ready to push and review.

- [ ] **Step 1: Run the complete repository test command**

Run: `npm test`

Expected: build validation and every `tests/*.test.mjs` test PASS.

- [ ] **Step 2: Run lint and inspect the final diff**

Run:

```bash
npm run lint
git diff origin/main...HEAD --check
git diff origin/main...HEAD --stat
git status --short
```

Expected: lint PASS, no whitespace errors, only feature/spec/plan changes, and a
clean worktree.

- [ ] **Step 3: Perform a requirement-by-requirement audit**

Confirm from source, migration, and tests that conversion remains forbidden;
all three relationship types work; same-project, task-only blocking, symmetric
normalization, duplicate, self, and cycle invariants are enforced; follow-up
creation is atomic and copies no event content; linked items are visible,
navigable, addable, and removable on desktop and mobile.

- [ ] **Step 4: Commit any verification fixes**

If verification changed files, stage only those explicit files and commit:

```bash
git commit -m "fix: address work item relation verification"
```

If no files changed, do not create an empty commit.
