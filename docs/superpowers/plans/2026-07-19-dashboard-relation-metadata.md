# Dashboard Relation Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show every task/event relationship as readable metadata on every dashboard work-item row and project collection row.

**Architecture:** Add one pure formatter in `lib/relation-metadata.ts` that owns direction-aware labels, deterministic ordering, missing-item handling, and metadata joining. Dashboard and project components consume that helper with their existing workspace snapshots; CSS only adapts wrapping and compact calendar layout.

**Tech Stack:** TypeScript, React 19, Vinext/Vite, Node test runner, CSS, existing `WorkspaceSnapshot` domain contracts.

## Global Constraints

- Show every relationship attached to each visible task or event.
- Preserve each surface's existing metadata before relationship phrases.
- Use the exact labels `Follow-up for`, `Followed by`, `Blocks`, `Blocked by`, and `Related to`.
- Order phrases by relationship type, linked-item title, and relationship ID.
- Ignore missing linked items.
- Cover Overview, Tasks, Events, Timeline Agenda, Timeline Month/Week, Spending work-item rows, and project collection rows.
- Do not change payment-history rows, schema, migrations, repository queries, or API contracts.

---

### Task 1: Pure Relation Metadata Formatter

**Files:**
- Create: `lib/relation-metadata.ts`
- Create: `tests/relation-metadata.test.mjs`

**Interfaces:**
- Consumes: `WorkItemRecord[]` and `WorkItemRelationRecord[]` from `lib/domain.ts`.
- Produces: `relationMetadataPhrases(itemId, relations, items): string[]` and `workItemMetadata(parts, itemId, relations, items): string`.

- [ ] **Step 1: Write failing direction and aggregation tests**

Create `tests/relation-metadata.test.mjs` with real task/event and relation records. Assert both perspectives of all directed types, symmetric labels, deterministic ordering for multiple links, ` · ` joining after base parts, and omission of missing linked records:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  relationMetadataPhrases,
  workItemMetadata,
} from "../lib/relation-metadata.ts";

const items = [
  { id: "kickoff", title: "Kickoff" },
  { id: "follow-up", title: "Follow-up" },
  { id: "blocker", title: "Blocker" },
  { id: "reference", title: "Reference" },
];
const relations = [
  {
    id: "relation-follow",
    type: "follows_from",
    sourceItemId: "kickoff",
    targetItemId: "follow-up",
  },
  {
    id: "relation-related",
    type: "related_to",
    sourceItemId: "follow-up",
    targetItemId: "reference",
  },
  {
    id: "relation-block",
    type: "blocks",
    sourceItemId: "blocker",
    targetItemId: "follow-up",
  },
];

test("relationship metadata uses the current item's perspective", () => {
  assert.deepEqual(
    relationMetadataPhrases("follow-up", relations, items),
    ["Blocked by Blocker", "Follow-up for Kickoff", "Related to Reference"],
  );
  assert.deepEqual(
    relationMetadataPhrases("kickoff", relations, items),
    ["Followed by Follow-up"],
  );
  assert.deepEqual(
    relationMetadataPhrases("blocker", relations, items),
    ["Blocks Follow-up"],
  );
  assert.deepEqual(
    relationMetadataPhrases("reference", relations, items),
    ["Related to Follow-up"],
  );
});

test("metadata appends every ordered phrase after existing parts", () => {
  assert.equal(
    workItemMetadata(
      ["Q3 Planning", "Operating plan"],
      "follow-up",
      relations,
      items,
    ),
    "Q3 Planning · Operating plan · Blocked by Blocker · Follow-up for Kickoff · Related to Reference",
  );
});

test("missing linked items are ignored", () => {
  assert.deepEqual(
    relationMetadataPhrases(
      "follow-up",
      [{
        id: "broken",
        type: "related_to",
        sourceItemId: "follow-up",
        targetItemId: "missing",
      }],
      items,
    ),
    [],
  );
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH node --experimental-strip-types --test tests/relation-metadata.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/relation-metadata.ts`.

- [ ] **Step 3: Implement the pure formatter**

Create `lib/relation-metadata.ts` with:

```ts
import type { WorkItemRecord, WorkItemRelationRecord } from "./domain.ts";

export function relationMetadataPhrases(
  itemId: string,
  relations: WorkItemRelationRecord[],
  items: WorkItemRecord[],
): string[] {
  return relations
    .filter((relation) =>
      relation.sourceItemId === itemId || relation.targetItemId === itemId,
    )
    .flatMap((relation) => {
      const outgoing = relation.sourceItemId === itemId;
      const linkedItemId = outgoing
        ? relation.targetItemId
        : relation.sourceItemId;
      const linkedItem = items.find((item) => item.id === linkedItemId);
      if (!linkedItem) return [];
      const prefix =
        relation.type === "follows_from"
          ? outgoing ? "Followed by" : "Follow-up for"
          : relation.type === "blocks"
            ? outgoing ? "Blocks" : "Blocked by"
            : "Related to";
      return [{
        phrase: `${prefix} ${linkedItem.title}`,
        type: relation.type,
        title: linkedItem.title,
        id: relation.id,
      }];
    })
    .sort((a, b) =>
      a.type.localeCompare(b.type) ||
      a.title.localeCompare(b.title) ||
      a.id.localeCompare(b.id),
    )
    .map(({ phrase }) => phrase);
}

export function workItemMetadata(
  parts: Array<string | null | undefined>,
  itemId: string,
  relations: WorkItemRelationRecord[],
  items: WorkItemRecord[],
): string {
  return [
    ...parts.filter((part): part is string => Boolean(part)),
    ...relationMetadataPhrases(itemId, relations, items),
  ].join(" · ");
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the Step 2 command. Expected: all formatter tests PASS.

- [ ] **Step 5: Commit the formatter**

```bash
git add lib/relation-metadata.ts tests/relation-metadata.test.mjs
git commit -m "feat: format work item relation metadata"
```

---

### Task 2: Global Dashboard Surfaces

**Files:**
- Modify: `app/components/dashboards.tsx`
- Modify: `tests/dashboard-contract.test.mjs`

**Interfaces:**
- Consumes: `workItemMetadata()` and `relationMetadataPhrases()` from Task 1.
- Produces: relation metadata in Overview, Tasks, Events, Timeline Agenda, Timeline Month/Week, and Spending work-item rows.

- [ ] **Step 1: Write failing dashboard integration contracts**

Extend `tests/dashboard-contract.test.mjs` to require the shared helper in every direct work-item renderer and to distinguish the payment feed:

```js
test("every dashboard work-item surface renders shared relation metadata", () => {
  assert.match(source, /import \{[\s\S]*workItemMetadata[\s\S]*relationMetadataPhrases[\s\S]*\} from "@\/lib\/relation-metadata"/);
  assert.match(source, /function TaskRow[\s\S]*workItemMetadata/);
  assert.match(source, /function EventRow[\s\S]*workItemMetadata/);
  assert.match(source, /agenda-item[\s\S]*workItemMetadata/);
  assert.match(source, /calendar-item[\s\S]*relationMetadataPhrases/);
  assert.match(source, /className="money-row"[\s\S]*workItemMetadata/);
});

test("payment-history metadata remains payment focused", () => {
  const paymentFeed = source.slice(source.indexOf('className="payment-feed"'));
  assert.doesNotMatch(paymentFeed, /workItemMetadata/);
});
```

- [ ] **Step 2: Run the dashboard test and verify RED**

Run:

```bash
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH node --experimental-strip-types --test tests/dashboard-contract.test.mjs
```

Expected: FAIL because dashboards do not import or call the relation metadata helpers.

- [ ] **Step 3: Integrate metadata into shared and specialized rows**

In `app/components/dashboards.tsx`:

- Import both helpers from `@/lib/relation-metadata`.
- Replace TaskRow, EventRow, and Timeline Agenda `<small>` contents with:

```tsx
<small>
  {workItemMetadata(
    [
      projectName(snapshot, item.projectId),
      collectionName(snapshot, item.collectionId),
    ],
    item.id,
    snapshot.relations,
    snapshot.items,
  )}
</small>
```

- Change Month/Week mapping to compute phrases per item and render a secondary line:

```tsx
{(byDate.get(date) ?? []).map((item) => {
  const relationPhrases = relationMetadataPhrases(
    item.id,
    snapshot.relations,
    snapshot.items,
  );
  return (
    <button
      type="button"
      key={item.id}
      className={`calendar-item calendar-${item.type}`}
      onClick={() => onOpenItem(item.id)}
    >
      <span aria-hidden="true">{item.type === "task" ? "✓" : "◷"}</span>
      <strong>{item.title}</strong>
      {relationPhrases.length ? (
        <small>{relationPhrases.join(" · ")}</small>
      ) : null}
    </button>
  );
})}
```

- Replace the Spending **Over estimate** row's project-only `<small>` with:

```tsx
<small>
  {workItemMetadata(
    [projectName(snapshot, item.projectId)],
    item.id,
    snapshot.relations,
    snapshot.items,
  )}
</small>
```

- Leave **Recent payments** unchanged.

- [ ] **Step 4: Run focused formatter and dashboard tests**

Run:

```bash
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH node --experimental-strip-types --test tests/relation-metadata.test.mjs tests/dashboard-contract.test.mjs
```

Expected: all tests PASS.

- [ ] **Step 5: Commit global dashboard integration**

```bash
git add app/components/dashboards.tsx tests/dashboard-contract.test.mjs
git commit -m "feat: show relations across dashboards"
```

---

### Task 3: Project Collections and Responsive Layout

**Files:**
- Modify: `app/components/project-workspace.tsx`
- Modify: `app/globals.css`
- Modify: `tests/workflow-contract.test.mjs`
- Modify: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Consumes: `workItemMetadata()` and `relationMetadataPhrases()` from Task 1.
- Produces: relation metadata in project collection rows plus wrapping calendar/row styles.

- [ ] **Step 1: Write failing project and responsive contracts**

Add assertions requiring `workItemMetadata` in both collection task/event rows and CSS that permits metadata wrapping and compact calendar secondary text:

```js
test("project collection work-item rows show relation metadata", () => {
  assert.match(projectSource, /@\/lib\/relation-metadata/);
  assert.match(projectSource, /tasks\.map[\s\S]*workItemMetadata/);
  assert.match(projectSource, /events\.map[\s\S]*workItemMetadata/);
});
```

```js
test("relation metadata wraps in rows and compact calendar cells", async () => {
  assert.match(css, /\.row-title small[\s\S]*white-space:\s*normal/);
  assert.match(css, /\.calendar-item small[\s\S]*white-space:\s*normal/);
});
```

- [ ] **Step 2: Run workflow and mobile tests and verify RED**

Run:

```bash
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH node --experimental-strip-types --test tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs
```

Expected: FAIL because the project rows and wrapping styles are absent.

- [ ] **Step 3: Integrate project rows and layout styles**

In `app/components/project-workspace.tsx`, import `workItemMetadata` and use it to append relations after:

- task due date and status:

```tsx
<small>
  {workItemMetadata(
    [
      task.dueDate ? `Due ${task.dueDate}` : "No due date",
      task.status.replace("_", " "),
    ],
    task.id,
    snapshot.relations,
    snapshot.items,
  )}
</small>
```

- event occurrence date:

```tsx
<small>
  {workItemMetadata(
    [`Occurs ${event.occurrenceDate}`],
    event.id,
    snapshot.relations,
    snapshot.items,
  )}
</small>
```

In `app/globals.css`:

- allow row metadata to wrap:

```css
.row-title small,
.agenda-item small {
  overflow-wrap: anywhere;
  white-space: normal;
  line-height: 1.45;
}
```

- replace the single-line `.calendar-item` layout and add secondary text:

```css
.calendar-item {
  display: grid;
  min-height: 32px;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 2px 4px;
  overflow: hidden;
  white-space: normal;
}

.calendar-item > span {
  grid-row: span 2;
}

.calendar-item strong,
.calendar-item small {
  min-width: 0;
  overflow-wrap: anywhere;
}

.calendar-item strong {
  font-size: 10px;
  font-weight: 600;
}

.calendar-item small {
  color: var(--text-muted);
  font-size: 9px;
  line-height: 1.35;
}
```

Preserve existing border, background, color, cursor, padding, and text-align
declarations from `.calendar-item`; only replace the overflow/ellipsis/nowrap
layout declarations. Existing mobile buttons remain at least 44px where the
mobile media query already enforces that minimum.

- [ ] **Step 4: Run all focused relation/UI tests**

Run:

```bash
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH node --experimental-strip-types --test tests/relation-metadata.test.mjs tests/dashboard-contract.test.mjs tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 5: Commit project and responsive integration**

```bash
git add app/components/project-workspace.tsx app/globals.css tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs
git commit -m "feat: show relations in project work item rows"
```

---

### Task 4: Full Verification and Existing PR Update

**Files:**
- Verify all modified files.
- Update existing draft PR `#7` by pushing `codex/work-item-relations`.

**Interfaces:**
- Consumes: completed Tasks 1-3.
- Produces: verified branch and updated draft PR.

- [ ] **Step 1: Run full automated verification**

```bash
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH npm test
PATH=/home/shalex/.nvm/versions/node/v24.15.0/bin:$PATH npm run lint
git diff --check
```

Expected: production build succeeds, every test passes, lint exits 0, and no whitespace errors are reported.

- [ ] **Step 2: Inspect scope and current branch state**

```bash
git status --short
git log --oneline origin/main..HEAD
git diff --stat origin/main...HEAD
```

Expected: no uncommitted files; only approved relation feature/spec/plan changes are present.

- [ ] **Step 3: Push and confirm the draft PR head**

```bash
git push origin codex/work-item-relations
gh pr view 7 --json url,state,isDraft,mergeable,mergeStateStatus,headRefOid
```

Expected: PR `#7` remains open as a draft, its head SHA matches local `HEAD`, and GitHub reports a clean merge state.
