# Receipt Files and Pinning Removal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show payment receipts in the Files tab, keep receipt access aligned in Payment history, and remove attachment pinning from the application and persisted schema.

**Architecture:** Keep attachments and receipts in their existing ownership models and merge them only in the item-sheet presentation. Remove pinning from active types, queries, routes, archive output, and SQLite storage; retain a parser-only compatibility allowance for the legacy archive property.

**Tech Stack:** React 19, TypeScript 5.9, Vite/Vinext, Cloudflare D1/R2, Drizzle Kit, Node test runner

## Global Constraints

- Receipts remain owned by payments and remain downloadable from Payment history.
- Only ordinary attachments expose Remove file; receipt lifecycle remains in Payment history.
- Existing `item_files` rows must survive the migration.
- Old version-1 archives with a boolean `pinned` field must import successfully, but new archives must omit it.
- Do not add dependencies or change authorization rules.
- Work on `feat/receipt-files-remove-pinning`; never commit directly to `main`.
- After verification, push the branch and open a pull request.

---

### Task 1: Remove Pinning From Runtime and Persistence

**Files:**
- Create: `tests/pinning-removal-contract.test.mjs`
- Create: `tests/pinning-removal-migration.test.mjs`
- Modify: `db/schema.ts`
- Modify: `lib/domain.ts`
- Modify: `lib/repository.ts`
- Modify: `app/api/files/route.ts`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/components/item-sheet.tsx`
- Create: `drizzle/0004_remove_item_file_pinning.sql`
- Create: `drizzle/meta/0004_snapshot.json`
- Modify: `drizzle/meta/_journal.json`

**Interfaces:**
- Consumes: existing `ItemFileRecord`, `loadWorkspaceSnapshot()`, file POST/DELETE handlers, and `ItemSheet` props.
- Produces: pin-free `ItemFileRecord`; files route with GET/POST/DELETE only; `item_files(id,item_id,file_object_id,position,created_at)`.

- [ ] **Step 1: Write failing source-contract and migration tests**

```js
// tests/pinning-removal-contract.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const sources = await Promise.all([
  "db/schema.ts",
  "lib/domain.ts",
  "lib/repository.ts",
  "app/api/files/route.ts",
  "app/components/harbor-app.tsx",
  "app/components/item-sheet.tsx",
].map((path) => readFile(new URL(path, root), "utf8")));
const activeSource = sources.join("\n");

test("active application layers do not expose attachment pinning", () => {
  assert.doesNotMatch(activeSource, /\bpinned\b|togglePin|onTogglePin|setItemFilePinned|Pin file|Unpin file/);
  assert.doesNotMatch(sources[3], /export async function PATCH/);
});
```

```js
// tests/pinning-removal-migration.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { Miniflare } from "miniflare";

const mf = new Miniflare({
  modules: true,
  script: "export default { fetch() { return new Response('ok'); } }",
  d1Databases: { DB: "pinning-removal-tests" },
});
const db = await mf.getD1Database("DB");
const statements = (sql) => sql.split("--> statement-breakpoint").map((part) => part.trim()).filter(Boolean);
const apply = async (path) => {
  const sql = await readFile(new URL(path, import.meta.url), "utf8");
  await db.batch(statements(sql).map((statement) => db.prepare(statement)));
};

await apply("../drizzle/0000_tired_squirrel_girl.sql");
await db.batch([
  db.prepare("INSERT INTO users (id,email,display_name) VALUES ('u','u@example.com','User')"),
  db.prepare("INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES ('p','u','P','','USD')"),
  db.prepare("INSERT INTO collections (id,project_id,name,color,position) VALUES ('c','p','C','cyan',0)"),
  db.prepare("INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,created_by) VALUES ('i','p','c','task','I','','todo',NULL,NULL,'u')"),
  db.prepare("INSERT INTO file_objects (id,project_id,r2_key,filename,content_type,size_bytes,uploaded_by) VALUES ('f','p','key','f.txt','text/plain',1,'u')"),
  db.prepare("INSERT INTO item_files (id,item_id,file_object_id,pinned,position,created_at) VALUES ('if','i','f',1,7,'2026-07-01T00:00:00.000Z')"),
]);
await apply("../drizzle/0004_remove_item_file_pinning.sql");

test.after(async () => mf.dispose());

test("migration preserves item-file relationships and removes pinned", async () => {
  const columns = await db.prepare("PRAGMA table_info(item_files)").all();
  assert.equal(columns.results.some((column) => column.name === "pinned"), false);
  assert.deepEqual(
    await db.prepare("SELECT id,item_id,file_object_id,position,created_at FROM item_files").first(),
    { id: "if", item_id: "i", file_object_id: "f", position: 7, created_at: "2026-07-01T00:00:00.000Z" },
  );
  assert.deepEqual((await db.prepare("PRAGMA foreign_key_check").all()).results, []);
});
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run: `node --experimental-strip-types --test tests/pinning-removal-contract.test.mjs tests/pinning-removal-migration.test.mjs`

Expected: FAIL because active sources still contain pinning and migration `0004` does not exist.

- [ ] **Step 3: Remove runtime pinning**

Make these exact changes:

```ts
// lib/domain.ts
export type ItemFileRecord = {
  id: string;
  itemId: string;
  fileObjectId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
};
```

In `lib/repository.ts`, remove `pinned` from preview DDL, `ItemFileRow`, SELECT projections, row mapping, INSERT columns, and ordering. Delete `setItemFilePinned()`. Order attachment rows with:

```sql
ORDER BY fo.created_at DESC, inf.position, inf.id
```

In `app/api/files/route.ts`, delete the `PATCH` export and the `setItemFilePinned` import. In `app/components/harbor-app.tsx`, delete `togglePin()` and stop passing `onTogglePin`. In `app/components/item-sheet.tsx`, remove the prop at both component layers and replace `pinnedFiles` with:

```ts
const itemFiles = useMemo(
  () => [...(item?.files ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  [item?.files],
);
```

- [ ] **Step 4: Change the Drizzle schema and generate the migration**

Use this table definition:

```ts
export const itemFiles = sqliteTable(
  "item_files",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id").notNull().references(() => workItems.id, { onDelete: "cascade" }),
    fileObjectId: text("file_object_id").notNull().references(() => fileObjects.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("item_files_file_unique").on(table.fileObjectId),
    index("item_files_item_idx").on(table.itemId, table.position),
  ],
);
```

Run: `npm run db:generate -- --name remove_item_file_pinning`

Expected: creates `drizzle/0004_remove_item_file_pinning.sql`, updates `drizzle/meta/_journal.json`, and creates `drizzle/meta/0004_snapshot.json`. Inspect the SQL and confirm it copies `id,item_id,file_object_id,position,created_at` before dropping the old table.

- [ ] **Step 5: Run focused tests**

Run: `node --experimental-strip-types --test tests/pinning-removal-contract.test.mjs tests/pinning-removal-migration.test.mjs tests/schema-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api/files/route.ts app/components/harbor-app.tsx app/components/item-sheet.tsx db/schema.ts lib/domain.ts lib/repository.ts drizzle tests/pinning-removal-contract.test.mjs tests/pinning-removal-migration.test.mjs
git commit -m "refactor: remove attachment pinning"
```

---

### Task 2: Remove Pinning From Archives With Legacy Import Compatibility

**Files:**
- Modify: `tests/project-archive.test.mjs`
- Modify: `tests/project-archive-zip.test.mjs`
- Modify: `tests/project-transfer-repository.test.mjs`
- Modify: `tests/project-transfer-routes.test.mjs`
- Modify: `lib/project-archive.ts`
- Modify: `lib/project-transfer-repository.ts`

**Interfaces:**
- Consumes: `parseProjectArchiveManifest(input): ProjectArchiveManifestV1` and transfer repository attachment records.
- Produces: pin-free `ProjectArchiveAttachment`; parser accepts optional legacy boolean `pinned` but never returns it.

- [ ] **Step 1: Update tests to define the pin-free archive contract**

Remove `pinned` from normal attachment fixtures and expected manifests. Add:

```js
test("accepts legacy pinned state without exposing it", () => {
  const legacy = validManifest();
  legacy.attachments[0].pinned = true;
  const parsed = parseProjectArchiveManifest(legacy);
  assert.equal("pinned" in parsed.attachments[0], false);

  legacy.attachments[0].pinned = "yes";
  assert.throws(
    () => parseProjectArchiveManifest(legacy),
    /legacy attachment pinned state must be boolean/i,
  );
});
```

In the export service test, assert:

```js
assert.equal("pinned" in decoded.manifest.attachments[0], false);
```

In the repository source contract, assert:

```js
assert.doesNotMatch(source, /\binf\.pinned\b|attachment\.pinned/);
```

- [ ] **Step 2: Run archive tests and verify they fail**

Run: `node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs`

Expected: FAIL because the archive type/parser/export/import still requires and persists `pinned`.

- [ ] **Step 3: Implement the archive compatibility boundary**

Remove `pinned` from `ProjectArchiveAttachment`. In `parseAttachment()` keep `"pinned"` in the allowed-key list solely for legacy input and use:

```ts
if ("pinned" in value && typeof value.pinned !== "boolean") {
  throw new DomainError("Legacy attachment pinned state must be boolean");
}
```

Do not include `pinned` in the returned attachment. In `lib/project-transfer-repository.ts`, remove it from attachment row types, SELECTs, mappings, and imported INSERTs:

```sql
INSERT INTO item_files
  (id,item_id,file_object_id,position,created_at)
VALUES (?,?,?,?,?)
```

- [ ] **Step 4: Run archive tests**

Run: `node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/project-archive.ts lib/project-transfer-repository.ts tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs
git commit -m "refactor: remove pinning from project archives"
```

---

### Task 3: Merge Receipts Into Files and Align Payment Actions

**Files:**
- Create: `tests/receipt-files-ui.test.mjs`
- Modify: `tests/workflow-contract.test.mjs`
- Modify: `app/components/item-sheet.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `item.files: ItemFileRecord[]`, `item.payments: PaymentRecord[]`, protected `/api/files?id=` downloads.
- Produces: `uploadedFiles` presentation union and consistent `.payment-actions` controls.

- [ ] **Step 1: Write the failing UI contract**

```js
// tests/receipt-files-ui.test.mjs
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const item = await readFile(new URL("app/components/item-sheet.tsx", root), "utf8");
const css = await readFile(new URL("app/globals.css", root), "utf8");

test("Files combines attachments and payment receipts", () => {
  assert.match(item, /kind:\s*"attachment"/);
  assert.match(item, /kind:\s*"receipt"/);
  assert.match(item, /Payment receipt/);
  assert.match(item, /Files \(\$\{uploadedFiles\.length\}\)/);
  assert.match(item, /payment\.receiptFileId[\s\S]*?receiptFilename/);
  assert.match(item, /Remove file/);
  assert.doesNotMatch(item, /Pin file|Unpin file/);
});

test("Payment history retains receipt access with aligned actions", () => {
  assert.match(item, /payment-actions[\s\S]*?>Receipt</);
  assert.match(item, /payment-actions[\s\S]*?>Edit</);
  assert.match(item, /payment-actions[\s\S]*?>Delete</);
  assert.match(css, /\.payment-actions (?:button,\s*\\n)?\.payment-actions a[\s\S]*?display:\s*inline-flex/);
  assert.match(css, /align-items:\s*center/);
});
```

Update `tests/workflow-contract.test.mjs` to require `"Remove file"` and to stop requiring `"Pin file"`.

- [ ] **Step 2: Run UI tests and verify they fail**

Run: `node --experimental-strip-types --test tests/receipt-files-ui.test.mjs tests/workflow-contract.test.mjs`

Expected: FAIL because receipts are absent from Files, Remove file is still an icon, and action controls do not share inline-flex layout.

- [ ] **Step 3: Build the merged presentation list**

In `ItemSheetContent`, create:

```ts
const uploadedFiles = useMemo(
  () =>
    [
      ...(item?.files ?? []).map((file) => ({
        kind: "attachment" as const,
        id: file.id,
        fileObjectId: file.fileObjectId,
        filename: file.filename,
        createdAt: file.createdAt,
        detail: `${(file.sizeBytes / 1024).toFixed(file.sizeBytes > 1024 * 1024 ? 0 : 1)} KB · ${file.contentType}`,
      })),
      ...(item?.payments ?? []).flatMap((payment) =>
        payment.receiptFileId && payment.receiptFilename
          ? [{
              kind: "receipt" as const,
              id: `receipt-${payment.id}`,
              fileObjectId: payment.receiptFileId,
              filename: payment.receiptFilename,
              createdAt: payment.createdAt,
              detail: `Payment receipt · ${payment.paidOn}`,
            }]
          : [],
      ),
    ].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
  [item?.files, item?.payments],
);
```

Use `uploadedFiles.length` in the Files tab label. Render one row per union member. Both kinds get Download; attachments additionally get:

```tsx
<button
  className="button button-danger"
  type="button"
  onClick={() => {
    if (window.confirm(`Remove ${file.filename}?`)) {
      void onDeleteFile(file.fileObjectId);
    }
  }}
>
  Remove file
</button>
```

Show the existing EmptyState only when `uploadedFiles.length === 0`.

- [ ] **Step 4: Update responsive file and payment-action styles**

Remove `.file-list article.pinned` and pin-marker styles. Use two-column file rows:

```css
.file-list article {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
}

.payment-actions button,
.payment-actions a {
  display: inline-flex;
  min-height: 36px;
  align-items: center;
  justify-content: center;
  padding: 0 6px;
  line-height: 1;
}
```

At mobile width, make `.file-actions` a grid with `grid-template-columns: repeat(auto-fit, minmax(120px, 1fr))`; retain the 44px minimum touch target for every file and payment action.

- [ ] **Step 5: Run UI tests**

Run: `node --experimental-strip-types --test tests/receipt-files-ui.test.mjs tests/workflow-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/item-sheet.tsx app/globals.css tests/receipt-files-ui.test.mjs tests/workflow-contract.test.mjs
git commit -m "feat: show receipts in item files"
```

---

### Task 4: Full Verification and Delivery

**Files:**
- Modify only files needed to correct verification findings.

**Interfaces:**
- Consumes: completed Tasks 1–3.
- Produces: verified branch and draft pull request.

- [ ] **Step 1: Search for active pinning remnants**

Run:

```bash
rg -n "\\bpinned\\b|togglePin|onTogglePin|setItemFilePinned|Pin file|Unpin file" app lib db README.md tests
```

Expected: matches only the explicit legacy archive compatibility test/parser and historical migration fixtures. Remove any active runtime, schema, new-export, or UI match.

- [ ] **Step 2: Run the full automated suite**

Run: `npm test`

Expected: PASS with zero failing tests.

- [ ] **Step 3: Run lint and artifact validation**

Run: `npm run lint && npm run validate:artifact`

Expected: both commands exit 0.

- [ ] **Step 4: Inspect the built UI**

Start the local app with `npm run dev`, open an existing item at desktop and 390px mobile widths, and verify:

- Files count includes attachments and receipts.
- Receipt row downloads the protected receipt and has no Remove file action.
- Attachment row shows Download and Remove file with no pin marker/control.
- Payment-history Receipt remains present.
- Receipt, Edit, and Delete share one baseline and touch-target height.
- Hebrew and English filenames do not overlap actions.

- [ ] **Step 5: Run a final diff and status audit**

Run:

```bash
git diff --check
git status --short
git log --oneline --decorate origin/main..HEAD
```

Expected: no whitespace errors, only intended files changed, and all implementation commits are on `feat/receipt-files-remove-pinning`.

- [ ] **Step 6: Push and open the pull request**

```bash
git push -u origin feat/receipt-files-remove-pinning
gh pr create --draft --base main --head feat/receipt-files-remove-pinning --title "Show receipts in files and remove pinning" --body-file /tmp/project-harbor-pr.md
```

The PR body must summarize receipt visibility, aligned payment actions, end-to-end pinning removal with lossless migration, legacy archive compatibility, and the verification commands run.
