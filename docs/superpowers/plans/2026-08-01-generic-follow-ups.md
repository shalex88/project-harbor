# Generic Follow-up Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let every task or event atomically create a task or event follow-up through a two-choice **Create follow-up** menu.

**Architecture:** Replace the event-to-task-only mutation with one discriminated `create_follow_up_item` contract whose source and destination can each be either work-item type. Keep creation and `follows_from` relation insertion in one repository batch, and generalize the item sheet's follow-up mode while isolating accessible menu behavior in a focused component.

**Tech Stack:** TypeScript 5.9, React 19, Vite/Vinext, Cloudflare D1, Node's built-in test runner, ESLint

## Global Constraints

- Both existing task and event details show the exact action label **Create follow-up**.
- The creation menu contains exactly the destination choices **Task** and **Event**.
- The follow-up form defaults to the source collection and permits only collections in the same project.
- The source may be a task or event, and the destination may be a task or event.
- Item creation, contact-state creation, and the `follows_from` relation must be one atomic D1 batch.
- The old internal `create_follow_up_task` action is replaced, not kept as an alias.
- No database migration and no new runtime dependency are introduced.
- Work in the current checkout on `feature/generic-follow-ups`; do not create a worktree or commit to `main`.

---

## File Structure

- Create `app/components/follow-up-menu.tsx`: owns menu open state, focus, keyboard navigation, outside-click dismissal, and destination-type selection.
- Create `app/components/follow-up-menu-navigation.ts`: pure keyboard-index calculation used by the component and behavior tests.
- Create `tests/follow-up-menu-navigation.test.mjs`: direct tests for Arrow Up/Down and Home/End navigation.
- Modify `lib/domain.ts`: define task/event variants of `create_follow_up_item`.
- Modify `lib/mutations.ts`: parse and validate both variants with type-specific allowed fields.
- Modify `lib/repository.ts`: authorize a generic source and atomically insert the chosen destination type, contacts, and relation.
- Modify `app/components/item-sheet.tsx`: generalize follow-up mode/source resolution, destination fields, submission, banner, and action menu.
- Modify `app/components/harbor-app.tsx`: carry source ID and destination type through sheet state, open the created item, and return the generic success message.
- Modify `app/globals.css`: style the follow-up menu without changing unrelated actions.
- Modify `tests/api-contract.test.mjs`: directly exercise the generic mutation parser.
- Modify `tests/repository-contract.test.mjs`: protect generic authorization, both insert branches, batching, relation direction, and created ID.
- Modify `tests/workflow-contract.test.mjs`: protect task/event source visibility and generic client state/payload wiring.
- Modify `tests/work-item-contact-ui.test.mjs` and `tests/work-item-contact-repository.test.mjs`: move contact-state coverage to the new generic action.

---

### Task 1: Generic Follow-up Mutation Contract

**Files:**
- Modify: `lib/domain.ts`
- Modify: `lib/mutations.ts`
- Test: `tests/api-contract.test.mjs`

**Interfaces:**
- Consumes: existing `TaskStatus`, `WorkItemContactMutationFields`, `id`, `requireText`, `optionalText`, `validateTaskStatus`, `validateIsoDate`, `validateOptionalIsoDate`, `estimate`, and `workItemContactFields`.
- Produces: `WorkspaceMutation` variants with `action: "create_follow_up_item"`, `sourceItemId: string`, `collectionId: string`, and `type: "task" | "event"` plus the corresponding ordinary creation fields.

- [ ] **Step 1: Replace the parser test with failing generic task and event cases**

In `tests/api-contract.test.mjs`, replace the event-specific follow-up test with direct task and event expectations:

```js
test("follow-up item mutations accept task and event destinations from any item", () => {
  assert.deepEqual(
    parseMutation({
      action: "create_follow_up_item",
      sourceItemId: "item-1",
      collectionId: "collection-1",
      type: "task",
      title: "Send the voucher",
      description: "",
      status: "todo",
      dueDate: null,
      estimatedCostMinor: null,
    }),
    {
      action: "create_follow_up_item",
      sourceItemId: "item-1",
      collectionId: "collection-1",
      type: "task",
      title: "Send the voucher",
      description: "",
      status: "todo",
      dueDate: null,
      estimatedCostMinor: null,
      manualContactIds: [],
      contactMentions: [],
    },
  );

  assert.deepEqual(
    parseMutation({
      action: "create_follow_up_item",
      sourceItemId: "item-2",
      collectionId: "collection-1",
      type: "event",
      title: "Voucher review",
      description: "Review received voucher",
      occurrenceDate: "2026-08-08",
      estimatedCostMinor: 1500,
    }),
    {
      action: "create_follow_up_item",
      sourceItemId: "item-2",
      collectionId: "collection-1",
      type: "event",
      title: "Voucher review",
      description: "Review received voucher",
      occurrenceDate: "2026-08-08",
      estimatedCostMinor: 1500,
      manualContactIds: [],
      contactMentions: [],
    },
  );
});

test("follow-up item mutations reject fields from the other destination type", () => {
  assert.throws(
    () => parseMutation({
      action: "create_follow_up_item",
      sourceItemId: "item-1",
      collectionId: "collection-1",
      type: "task",
      title: "Task",
      status: "todo",
      occurrenceDate: "2026-08-08",
    }),
    /unsupported field/i,
  );
  assert.throws(
    () => parseMutation({
      action: "create_follow_up_item",
      sourceItemId: "item-1",
      collectionId: "collection-1",
      type: "event",
      title: "Event",
      occurrenceDate: "2026-08-08",
      status: "todo",
    }),
    /unsupported field/i,
  );
});
```

Production mutation that makes these tests fail: keeping only the old `create_follow_up_task` parser branch or accepting the wrong type-specific fields.

- [ ] **Step 2: Run the parser tests and verify RED**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs`

Expected: FAIL because `create_follow_up_item` is not a supported action.

- [ ] **Step 3: Define the discriminated mutation variants**

In `lib/domain.ts`, replace the old follow-up variant with:

```ts
  | ({
      action: "create_follow_up_item";
      sourceItemId: string;
      collectionId: string;
      type: "task";
      title: string;
      description?: string;
      status: TaskStatus;
      dueDate?: string | null;
      estimatedCostMinor?: number | null;
    } & WorkItemContactMutationFields)
  | ({
      action: "create_follow_up_item";
      sourceItemId: string;
      collectionId: string;
      type: "event";
      title: string;
      description?: string;
      occurrenceDate: string;
      estimatedCostMinor?: number | null;
    } & WorkItemContactMutationFields)
```

- [ ] **Step 4: Parse each destination type with an exact allow-list**

In `lib/mutations.ts`, replace the old case with a `create_follow_up_item` case. For `type === "task"`, allow and return `sourceItemId`, `collectionId`, `type`, `title`, `description`, `status`, `dueDate`, `estimatedCostMinor`, and `WORK_ITEM_CONTACT_KEYS`. For `type === "event"`, allow and return the same shared keys but `occurrenceDate` instead of task workflow fields. Use `id(value.sourceItemId, "Source item")` and the same field validators as `create_item`; otherwise throw `DomainError("Item type must be task or event")`.

- [ ] **Step 5: Run the parser tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit the mutation contract**

```bash
git add lib/domain.ts lib/mutations.ts tests/api-contract.test.mjs
git commit -m "Generalize the follow-up mutation contract"
```

---

### Task 2: Atomic Generic Follow-up Persistence

**Files:**
- Modify: `lib/repository.ts`
- Modify: `tests/repository-contract.test.mjs`
- Modify: `tests/work-item-contact-repository.test.mjs`

**Interfaces:**
- Consumes: Task 1's `create_follow_up_item` union and existing repository helpers `authorizedRelationItem`, `authorizedCollectionProject`, `validateWorkItemContactState`, `appendContactStateStatements`, and item field validators.
- Produces: one mutation branch that accepts either source type, builds either destination insert, appends a source-to-new-item `follows_from` insert and contact statements, executes one `db.batch(statements)`, and assigns `createdItemId`.

- [ ] **Step 1: Write failing repository contract assertions**

In `tests/repository-contract.test.mjs`, replace the old follow-up assertions with:

```js
test("follow-up creation authorizes generic source and collection before comparing projects", () => {
  const followUpCase = repository.slice(
    repository.indexOf('case "create_follow_up_item"'),
    repository.indexOf('case "create_relation"'),
  );
  assert.match(followUpCase, /authorizedRelationItem\(\s*user\.id,\s*mutation\.sourceItemId/);
  assert.match(followUpCase, /authorizedCollectionProject\(\s*user\.id,\s*mutation\.collectionId/);
  assert.doesNotMatch(followUpCase, /source\.type\s*!==\s*"event"/);
  assert.ok(
    followUpCase.indexOf("authorizedCollectionProject") <
      followUpCase.indexOf("Follow-up item collection must belong to the source project"),
  );
});

test("follow-up creation inserts either item type and batches the relation", () => {
  const followUpCase = repository.slice(
    repository.indexOf('case "create_follow_up_item"'),
    repository.indexOf('case "create_relation"'),
  );
  assert.match(followUpCase, /mutation\.type === "task"/);
  assert.match(followUpCase, /'task'/);
  assert.match(followUpCase, /'event'/);
  assert.match(followUpCase, /source\.id,\s*itemId/);
  assert.match(followUpCase, /'follows_from'/);
  assert.match(followUpCase, /appendContactStateStatements\(statements/);
  assert.match(followUpCase, /await db\.batch\(statements\)/);
  assert.match(followUpCase, /createdItemId = itemId/);
});
```

Update `tests/work-item-contact-repository.test.mjs` to locate `create_follow_up_item` and continue asserting that it validates contact state and appends contact statements before the batch.

Production mutations that make these tests fail: reintroducing an event-only source check, omitting one destination insert, reversing the relation, or issuing separate writes.

- [ ] **Step 2: Run repository contract tests and verify RED**

Run: `node --experimental-strip-types --test tests/repository-contract.test.mjs tests/work-item-contact-repository.test.mjs`

Expected: FAIL because the repository still has the old action and event-only source validation.

- [ ] **Step 3: Implement generic authorization and validation**

Replace the repository switch case with `case "create_follow_up_item"`. Resolve `mutation.sourceItemId` with `authorizedRelationItem`, authorize `mutation.collectionId`, and reject a project mismatch with exactly `Follow-up item collection must belong to the source project`. Remove all source-type restrictions. Validate shared title, description, estimated cost, and contact state using the source project.

- [ ] **Step 4: Build the destination-specific insert and atomic statement list**

Create `itemId = crypto.randomUUID()` and `statements: D1PreparedStatement[] = []`. Push the same task insert used by `create_item` when `mutation.type === "task"`, or the same event insert when it is `"event"`. Then push:

```ts
db
  .prepare(
    `INSERT INTO work_item_relations (id,project_id,source_item_id,target_item_id,type,created_by)
     VALUES (?,?,?,?, 'follows_from',?)`,
  )
  .bind(crypto.randomUUID(), source.projectId, source.id, itemId, user.id)
```

Append contact statements, run `await db.batch(statements)`, and set `createdItemId = itemId`.

- [ ] **Step 5: Run repository contract tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/repository-contract.test.mjs tests/work-item-contact-repository.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 6: Commit persistence**

```bash
git add lib/repository.ts tests/repository-contract.test.mjs tests/work-item-contact-repository.test.mjs
git commit -m "Create generic follow-up items atomically"
```

---

### Task 3: Follow-up Type Menu and Generic Sheet Flow

**Files:**
- Create: `app/components/follow-up-menu-navigation.ts`
- Create: `app/components/follow-up-menu.tsx`
- Create: `tests/follow-up-menu-navigation.test.mjs`
- Modify: `app/components/item-sheet.tsx`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/workflow-contract.test.mjs`
- Modify: `tests/work-item-contact-ui.test.mjs`

**Interfaces:**
- Consumes: Task 1's `create_follow_up_item` mutation and Task 2's `createdItemId` response behavior.
- Produces: `FollowUpMenu({ disabled, onSelect }: { disabled?: boolean; onSelect: (type: "task" | "event") => void })`, `nextFollowUpMenuIndex(key: string, currentIndex: number, itemCount: number): number | null`, and generalized `ItemSheetMode` follow-up state.

- [ ] **Step 1: Write failing pure navigation and UI contract tests**

Create `tests/follow-up-menu-navigation.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { nextFollowUpMenuIndex } from "../app/components/follow-up-menu-navigation.ts";

test("follow-up menu navigation wraps with arrow keys", () => {
  assert.equal(nextFollowUpMenuIndex("ArrowDown", 0, 2), 1);
  assert.equal(nextFollowUpMenuIndex("ArrowDown", 1, 2), 0);
  assert.equal(nextFollowUpMenuIndex("ArrowUp", 0, 2), 1);
  assert.equal(nextFollowUpMenuIndex("ArrowUp", 1, 2), 0);
});

test("follow-up menu navigation handles boundaries and unrelated keys", () => {
  assert.equal(nextFollowUpMenuIndex("Home", 1, 2), 0);
  assert.equal(nextFollowUpMenuIndex("End", 0, 2), 1);
  assert.equal(nextFollowUpMenuIndex("Escape", 0, 2), null);
  assert.equal(nextFollowUpMenuIndex("ArrowDown", 0, 0), null);
});
```

Update `tests/workflow-contract.test.mjs` so the follow-up workflow test reads `follow-up-menu.tsx` in addition to item-sheet and harbor sources, then asserts `Create follow-up`, `Task`, `Event`, `aria-haspopup="menu"`, `role="menu"`, `role="menuitem"`, `sourceItemId`, `type: "task" | "event"`, `action: "create_follow_up_item"`, `Follows from`, and `result.createdItemId`. Assert there is no `item.type === "event"` condition around rendering the menu.

Update `tests/work-item-contact-ui.test.mjs` to require the generic follow-up action to spread `contactFields`.

Production changes that make these tests fail: breaking wraparound navigation, removing a destination choice, limiting the action to event sources, losing selected destination type, or dropping contact state.

- [ ] **Step 2: Run UI-focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/follow-up-menu-navigation.test.mjs tests/workflow-contract.test.mjs tests/work-item-contact-ui.test.mjs`

Expected: FAIL because the helper/component do not exist and the sheet is event-to-task only.

- [ ] **Step 3: Implement the pure menu navigation helper**

Create `app/components/follow-up-menu-navigation.ts`:

```ts
export function nextFollowUpMenuIndex(
  key: string,
  currentIndex: number,
  itemCount: number,
): number | null {
  if (itemCount <= 0) return null;
  if (key === "ArrowDown") return (currentIndex + 1) % itemCount;
  if (key === "ArrowUp") return (currentIndex - 1 + itemCount) % itemCount;
  if (key === "Home") return 0;
  if (key === "End") return itemCount - 1;
  return null;
}
```

- [ ] **Step 4: Implement the accessible two-choice menu**

Create `app/components/follow-up-menu.tsx` as a client component. Render a secondary button labeled **Create follow-up** with `aria-haspopup="menu"`, `aria-expanded`, and `aria-controls`. When open, render exactly two `role="menuitem"` buttons labeled **Task** and **Event** inside `role="menu"`. Use refs plus `nextFollowUpMenuIndex` for Arrow Up/Down and Home/End, activate native buttons with Enter/Space, dismiss with Escape or an outside `pointerdown`, and restore trigger focus only for dismissal without selection.

- [ ] **Step 5: Generalize item sheet mode and submission**

In `app/components/item-sheet.tsx`:

```ts
export type ItemSheetMode =
  | { kind: "new"; type: "task" | "event"; collectionId: string }
  | {
      kind: "follow-up";
      sourceItemId: string;
      type: "task" | "event";
      collectionId: string;
    }
  | { kind: "existing"; itemId: string }
  | null;
```

Rename `sourceEvent` to `sourceItem`, resolve it without a type filter, derive follow-up `type` from `mode.type`, use source project/collection context, and show `Source item unavailable` if it disappears. In both task and event submit branches, send `action: "create_follow_up_item"`, `sourceItemId`, selected `collectionId`, the correct literal `type`, ordinary type-specific fields, and `contactFields` when `mode.kind === "follow-up"`. Render `FollowUpMenu` for every existing item and invoke `onStartFollowUp(item.id, item.collectionId, selectedType)`.

- [ ] **Step 6: Carry generic state through HarborApp and success messaging**

Change `onStartFollowUp` to accept `(sourceItemId, collectionId, type)`, set the generalized follow-up mode, open `result.createdItemId` for `create_follow_up_item`, and return `Follow-up task created` or `Follow-up event created` from `successMessage` based on `mutation.type`.

- [ ] **Step 7: Style the menu**

Add scoped `.follow-up-menu`, `.follow-up-menu-popover`, and `.follow-up-menu-popover button` rules. Anchor the menu above the action button to avoid the sheet footer edge, use the existing card/background, border, shadow, focus-visible, and minimum touch-target conventions, and keep it within the sheet width on mobile.

- [ ] **Step 8: Run UI-focused tests and verify GREEN**

Run: `node --experimental-strip-types --test tests/follow-up-menu-navigation.test.mjs tests/workflow-contract.test.mjs tests/work-item-contact-ui.test.mjs`

Expected: PASS with zero failures.

- [ ] **Step 9: Run type/build verification for cross-layer exhaustiveness**

Run: `npm run build`

Expected: exit 0; TypeScript accepts the renamed action in every exhaustive switch and the Vite build completes.

- [ ] **Step 10: Commit the client flow**

```bash
git add app/components/follow-up-menu-navigation.ts app/components/follow-up-menu.tsx app/components/item-sheet.tsx app/components/harbor-app.tsx app/globals.css tests/follow-up-menu-navigation.test.mjs tests/workflow-contract.test.mjs tests/work-item-contact-ui.test.mjs
git commit -m "Add task and event follow-up creation menu"
```

---

### Task 4: Full Verification, Runtime Smoke Test, and Review

**Files:**
- Verify: all files changed by Tasks 1-3
- Test: complete `tests/*.test.mjs` suite

**Interfaces:**
- Consumes: the completed mutation, persistence, and client flow.
- Produces: fresh build/lint/test evidence, runtime evidence for all source/destination combinations, and a reviewed branch ready for PR.

- [ ] **Step 1: Scan for stale event-only follow-up code**

Run:

```bash
rg -n "create_follow_up_task|sourceEventId|sourceEvent|Follow-up tasks require a source event|Create follow-up task" app lib tests
```

Expected: no matches. References in historical design/plan documents are outside this scan and remain unchanged.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: exit 0 with no errors or warnings.

- [ ] **Step 3: Run the full test suite**

Run: `npm test`

Expected: build exit 0 and every `tests/*.test.mjs` test passes with zero failures.

- [ ] **Step 4: Exercise the local UI**

With the local app at `http://localhost:5173`, open one existing task and one existing event. For each source, activate **Create follow-up**, confirm the menu exposes **Task** and **Event**, create one destination type, and verify the created item opens with **Follows from** relation metadata. Across the two sources, cover both destination types. Also verify Escape closes the menu and returns focus to its trigger.

- [ ] **Step 5: Inspect the final diff and request code review**

Run `git diff --check`, `git status --short --branch`, and `git diff origin/main...HEAD`. Dispatch the required read-only reviewer against `origin/main...HEAD`; fix all Critical and Important findings with a failing test first, then rerun lint and the full suite.

- [ ] **Step 6: Commit any review fixes**

If review required changes:

```bash
git add app/components/follow-up-menu-navigation.ts app/components/follow-up-menu.tsx app/components/item-sheet.tsx app/components/harbor-app.tsx app/globals.css lib/domain.ts lib/mutations.ts lib/repository.ts tests/api-contract.test.mjs tests/follow-up-menu-navigation.test.mjs tests/repository-contract.test.mjs tests/workflow-contract.test.mjs tests/work-item-contact-ui.test.mjs tests/work-item-contact-repository.test.mjs
git commit -m "Address generic follow-up review feedback"
```

If there were no changes, do not create an empty commit.

- [ ] **Step 7: Push and open the pull request**

Push `feature/generic-follow-ups` to `origin` and open a PR targeting `main`. Include the four supported source/destination combinations and the fresh verification commands in the PR body.
