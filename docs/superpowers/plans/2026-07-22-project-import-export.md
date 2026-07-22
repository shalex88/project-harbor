# Project Import and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add safe full-project ZIP export and fresh-project ZIP import, including attachments and receipts, through the annotated desktop and mobile UI entry points.

**Architecture:** A strict version-1 archive module owns the portable manifest, validation, path safety, checksums, limits, and ZIP codec. A project-transfer repository owns project-scoped SQL and fresh-ID persistence, while a transfer service coordinates D1 and R2 cleanup. Two authenticated API routes expose export and import; `HarborApp` and `AppShell` provide the import modal and accessible project overflow menus.

**Tech Stack:** TypeScript 5.9, React 19, Next 16/Vinext, Cloudflare D1 and R2, Drizzle migrations, `fflate` 0.7.4, Web Crypto SHA-256, Node test runner.

## Global Constraints

- Archive filenames end in `.harbor.zip`; the ZIP contains only `manifest.json`, `attachments/`, and `receipts/` entries.
- Import always creates a new project with fresh database IDs and R2 keys; it never updates an existing project.
- Memberships, invitations, emails, internal user IDs, credentials, and access roles are never exported.
- The importer becomes owner; archived display names are non-authorizing imported-attribution labels.
- Compressed archive limit: 50 MiB. Expanded-content limit: 100 MiB. ZIP-entry limit: 1,000.
- Ordinary attachments keep the existing 25 MiB per-file limit; receipts keep the existing 10 MiB per-file limit.
- Reject encrypted/unsupported ZIP entries, unsafe or duplicate paths, unknown manifest keys, bad references, invalid domain fields, missing payloads, extra payloads, size mismatches, and SHA-256 mismatches.
- A failed import must not expose a partial project and must best-effort-delete every newly uploaded R2 object.
- Export is available to every project member; import is available to every signed-in user.

---

## File Structure

- `lib/project-archive.ts`: version-1 manifest types, strict parser, reference and relation validation, limits, SHA-256, safe filenames.
- `lib/project-archive-zip.ts`: `fflate` ZIP encode/decode and entry metadata/path enforcement.
- `lib/project-transfer-repository.ts`: project-scoped export queries, import ID planning, and atomic D1 batch persistence.
- `lib/project-transfer.ts`: R2/D1 orchestration, payload integrity checks, cleanup, and route-facing import/export results.
- `app/api/projects/[projectId]/archive/route.ts`: authenticated ZIP download.
- `app/api/projects/import/route.ts`: authenticated raw-ZIP upload returning snapshot plus new project ID.
- `app/components/project-menu.tsx`: reusable accessible overflow menu for desktop and mobile project rows.
- Existing domain, schema, storage, shell, app, CSS, migration, and tests change only for their focused integration responsibilities.

---

### Task 1: Imported attribution persistence

**Files:**
- Modify: `db/schema.ts`
- Modify: `lib/domain.ts`
- Modify: `lib/repository.ts`
- Modify: `tests/schema-contract.test.mjs`
- Modify: `tests/repository-contract.test.mjs`
- Create: generated `drizzle/0003_*.sql`
- Modify: generated `drizzle/meta/_journal.json`
- Create: generated `drizzle/meta/0003_snapshot.json`

**Interfaces:**
- Produces: nullable `importedCreatorLabel` on work items/payments, nullable `importedUploaderLabel` on file objects, and snapshot-facing imported display labels.
- Consumed by: archive export queries in Task 4 and payment/UI behavior already using `createdByName`.

- [ ] **Step 1: Write failing schema and repository contract assertions**

Add assertions that all three nullable columns exist and that snapshot queries prefer them without changing authorization IDs:

```js
assert.match(migration, /imported_creator_label/);
assert.match(migration, /imported_uploader_label/);
assert.match(repository, /COALESCE\(wi\.imported_creator_label,u\.display_name\)/);
assert.match(repository, /COALESCE\(p\.imported_creator_label,u\.display_name\)/);
assert.match(repository, /COALESCE\(fo\.imported_uploader_label,u\.display_name\)/);
assert.match(repository, /\|\| ' \(imported\)'/);
```

- [ ] **Step 2: Run the targeted tests and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/schema-contract.test.mjs tests/repository-contract.test.mjs
```

Expected: FAIL because the imported-attribution columns and SQL projections do not exist.

- [ ] **Step 3: Add nullable schema fields and snapshot labels**

Add these Drizzle fields:

```ts
// workItems and payments
importedCreatorLabel: text("imported_creator_label"),

// fileObjects
importedUploaderLabel: text("imported_uploader_label"),
```

Add the same nullable columns to the development-only `PREVIEW_SCHEMA` table
definitions in `lib/repository.ts` so local preview databases and migrated D1
databases expose the same shape.

Extend snapshot row queries by joining the actor user and projecting a display-only label:

```sql
CASE
  WHEN wi.imported_creator_label IS NOT NULL
    THEN wi.imported_creator_label || ' (imported)'
  ELSE creator.display_name
END AS created_by_name
```

Use the same expression for payments and file uploaders. Add `createdByName` to `WorkItemBase` and `uploadedByName` to `ItemFileRecord`; keep the existing actor IDs unchanged for authorization.

- [ ] **Step 4: Generate and inspect the D1 migration**

Run:

```bash
npm run db:generate
```

Expected: a new migration adding only the three nullable label columns, plus matching Drizzle metadata.

- [ ] **Step 5: Run targeted tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add db/schema.ts lib/domain.ts lib/repository.ts drizzle tests/schema-contract.test.mjs tests/repository-contract.test.mjs
git commit -m "feat: preserve imported attribution labels"
```

---

### Task 2: Strict version-1 archive manifest

**Files:**
- Create: `lib/project-archive.ts`
- Create: `tests/project-archive.test.mjs`

**Interfaces:**
- Produces: `PROJECT_ARCHIVE_FORMAT`, `PROJECT_ARCHIVE_VERSION`, limit constants, `ProjectArchiveManifestV1`, `parseProjectArchiveManifest(input)`, `validateArchivePayloads(manifest, payloads)`, `sha256Hex(bytes)`, and `projectArchiveFilename(name)`.
- Consumes: validation helpers from `lib/domain.ts` and `validateUpload` from `lib/upload-policy.ts`.

- [ ] **Step 1: Write failing manifest tests**

Create a small valid fixture and tests for strict parsing, fresh archive-local references, relation rules, and filenames:

```js
test("parses a complete version-1 archive manifest", () => {
  const manifest = parseProjectArchiveManifest(validManifest());
  assert.equal(manifest.format, "project-harbor-project");
  assert.equal(manifest.items[0].collectionId, "collection-1");
});

test("rejects unknown fields and dangling references", () => {
  assert.throws(
    () => parseProjectArchiveManifest({ ...validManifest(), secret: true }),
    /unsupported field/i,
  );
  const value = validManifest();
  value.items[0].collectionId = "missing";
  assert.throws(() => parseProjectArchiveManifest(value), /collection reference/i);
});

test("rejects unsafe payload paths", () => {
  const value = validManifest();
  value.attachments[0].path = "attachments/../secret";
  assert.throws(() => parseProjectArchiveManifest(value), /unsafe archive path/i);
});

test("builds a sanitized Harbor filename", () => {
  assert.equal(projectArchiveFilename('  בניית / בית  '), "בניית-בית.harbor.zip");
});
```

Add separate cases for duplicate IDs, self-links, cycles in `blocks`/`follows_from`, noncanonical `related_to`, invalid task/event fields, invalid money, invalid dates, unsupported currency/color, more than 1,000 entries, and invalid SHA-256 strings.

- [ ] **Step 2: Run the archive tests and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-archive.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/project-archive.ts`.

- [ ] **Step 3: Implement strict parsing and invariant validation**

Define explicit record types and reject unknown keys at every object level. Export exact constants:

```ts
export const PROJECT_ARCHIVE_FORMAT = "project-harbor-project" as const;
export const PROJECT_ARCHIVE_VERSION = 1 as const;
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 1_000;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const ARCHIVE_COLORS = ["cyan", "seafoam", "violet", "amber"] as const;
```

Use `DomainError` for safe browser messages. Validate all archive-local IDs as non-empty strings no longer than 100 characters. Build sets for every entity group, validate ownership references, and run graph traversal to reject directed cycles. Require `sourceItemId < targetItemId` for `related_to`.

Implement checksum and filenames:

```ts
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function projectArchiveFilename(name: string): string {
  const stem = name.normalize("NFKC").replace(/[\\/\u0000-\u001f\u007f]+/g, " ")
    .trim().replace(/\s+/g, "-").slice(0, 80) || "project";
  return `${stem}.harbor.zip`;
}
```

- [ ] **Step 4: Implement payload validation**

`validateArchivePayloads` accepts `Map<string, Uint8Array>`, requires a one-to-one match with attachment/receipt declarations, applies `validateUpload` through `File` instances, checks actual lengths, enforces 100 MiB total output, and compares SHA-256 using constant-time string equality.

- [ ] **Step 5: Run archive tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/project-archive.ts tests/project-archive.test.mjs
git commit -m "feat: define the Harbor project archive contract"
```

---

### Task 3: ZIP codec and hostile-entry protection

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `lib/project-archive-zip.ts`
- Create: `tests/project-archive-zip.test.mjs`

**Interfaces:**
- Consumes: archive constants and parser from Task 2; `fflate` ZIP primitives.
- Produces: `encodeProjectArchive(manifest, payloads): Uint8Array` and `decodeProjectArchive(bytes): Promise<{ manifest: ProjectArchiveManifestV1; payloads: Map<string, Uint8Array> }>`.

- [ ] **Step 1: Write failing ZIP round-trip and attack tests**

```js
test("round trips manifest, attachment, and receipt bytes", async () => {
  const input = validArchivePayloads();
  const bytes = encodeProjectArchive(input.manifest, input.payloads);
  const decoded = await decodeProjectArchive(bytes);
  assert.deepEqual(decoded.manifest, input.manifest);
  assert.deepEqual(decoded.payloads.get("attachments/file-1"), input.payloads.get("attachments/file-1"));
});

test("rejects duplicate normalized and unexpected ZIP entries", async () => {
  await assert.rejects(() => decodeProjectArchive(zipWith(["manifest.json", "../manifest.json"])), /unsafe archive path/i);
  await assert.rejects(() => decodeProjectArchive(zipWith(["manifest.json", "other/data"])), /unexpected archive entry/i);
});
```

Add cases for compressed size, expanded size, entry count, missing/duplicate manifest, directory entries, backslashes, encrypted flag, and unsupported compression method.

- [ ] **Step 2: Run ZIP tests and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-archive-zip.test.mjs
```

Expected: FAIL because the ZIP codec does not exist.

- [ ] **Step 3: Promote the locked transitive `fflate` to a runtime dependency**

Run:

```bash
npm install --save --save-exact fflate@0.7.4
```

Expected: `fflate` appears under `dependencies`, and the lockfile node keeps version `0.7.4` without a dev-only marker.

- [ ] **Step 4: Implement deterministic ZIP encoding and strict decoding**

Encode `manifest.json` first with UTF-8 JSON and payloads sorted by path. Store already-compressed media without recompressing and deflate text/PDF payloads at level 6. Reject a raw archive larger than `MAX_ARCHIVE_BYTES` before unzip. Inspect ZIP headers before decompression so directory, encrypted, unsupported-method, duplicate-normalized, and unsafe entries are rejected without trusting manifest content. Count actual decompressed bytes and entries, parse the manifest, then call `validateArchivePayloads`.

The public decode shape is:

```ts
export async function decodeProjectArchive(
  bytes: Uint8Array,
): Promise<DecodedProjectArchive> {
  inspectZipHeaders(bytes);
  const entries = unzipSync(bytes);
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes) throw new DomainError("This archive is damaged or incomplete");
  const manifest = parseProjectArchiveManifest(JSON.parse(strFromU8(manifestBytes)));
  const payloads = new Map(Object.entries(entries).filter(([path]) => path !== "manifest.json"));
  await validateArchivePayloads(manifest, payloads);
  return { manifest, payloads };
}
```

- [ ] **Step 5: Run archive and ZIP tests**

Run:

```bash
node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-archive-zip.test.mjs
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/project-archive-zip.ts tests/project-archive-zip.test.mjs
git commit -m "feat: encode and validate Harbor ZIP archives"
```

---

### Task 4: Project-scoped export and fresh-ID import repository

**Files:**
- Create: `lib/project-transfer-repository.ts`
- Create: `tests/project-transfer-repository.test.mjs`
- Modify: `lib/repository.ts`

**Interfaces:**
- Consumes: `IdentityUser`, raw D1, existing access helpers, Task 1 attribution fields, and Task 2 manifest types.
- Produces: `loadProjectArchiveSource(identity, projectId): Promise<ProjectArchiveSource>`, `planProjectImport(identity, manifest): Promise<PlannedProjectImport>`, and `persistProjectImport(plan): Promise<string>`.

- [ ] **Step 1: Write failing repository contract tests**

Assert project scoping, access-first ordering, excluded access data, new IDs, actor remapping, and one D1 batch:

```js
assert.match(source, /requireProjectAccess\(user\.id, projectId\)/);
assert.match(source, /WHERE p\.id = \?/);
assert.doesNotMatch(source, /project_invitations/);
assert.doesNotMatch(source, /SELECT[^;]*email/i);
assert.match(source, /crypto\.randomUUID\(\)/);
assert.match(source, /imported_creator_label/);
assert.match(source, /db\.batch\(statements\)/);
```

Add a pure test for an exported `createImportIdPlan` helper proving all entity IDs and R2 keys are unique and every relation/payment/file reference points to its remapped owner.

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-transfer-repository.test.mjs
```

Expected: FAIL because the transfer repository does not exist.

- [ ] **Step 3: Implement project-scoped export queries**

Authorize before detailed queries. Query the selected project and its collections, work items with creator display labels, relations, payments with creator labels, attachment metadata with uploader labels/R2 keys, and receipt metadata with uploader labels/R2 keys. Every query contains `project_id = ?` or joins through rows constrained by that project ID. Do not query members or invitations except `requireProjectAccess`.

- [ ] **Step 4: Implement deterministic fresh-ID planning**

Create maps for project, collections, items, relations, payments, file objects, item-file rows, and receipt links. Every map value uses `crypto.randomUUID()`. New R2 keys use:

```ts
const r2Key = `projects/${projectId}/${fileObjectId}`;
```

Map every `created_by`/`uploaded_by` FK to the importer while copying manifest display names into the Task 1 imported-label columns.

- [ ] **Step 5: Implement atomic D1 persistence**

Build prepared statements for the project, one owner membership, ordered collections, work items, relations, payments, file objects, item-file links, and payment-receipt links. Use archived content timestamps for child records; let the imported project receive current timestamps so it appears as newly created. Call exactly one `db.batch(statements)`. Return the new project ID only after the batch resolves.

- [ ] **Step 6: Run targeted tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/project-transfer-repository.ts lib/repository.ts tests/project-transfer-repository.test.mjs
git commit -m "feat: persist project archive transfers"
```

---

### Task 5: R2 orchestration and authenticated archive routes

**Files:**
- Modify: `lib/storage.ts`
- Create: `lib/project-transfer.ts`
- Create: `app/api/projects/[projectId]/archive/route.ts`
- Create: `app/api/projects/import/route.ts`
- Create: `tests/project-transfer-routes.test.mjs`

**Interfaces:**
- Consumes: ZIP codec, archive repository, R2 storage helpers, `requireAppUser`, `errorResponse`, and `loadWorkspaceSnapshot`.
- Produces: `exportProjectArchive(identity, projectId): Promise<{ bytes; filename }>` and `importProjectArchive(identity, bytes): Promise<{ snapshot; projectId }>`.

- [ ] **Step 1: Write failing route/orchestration tests**

```js
assert.match(exportRoute, /requireAppUser\(\)/);
assert.match(exportRoute, /downloadHeaders/);
assert.match(exportRoute, /application\/zip/);
assert.match(importRoute, /requireAppUser\(\)/);
assert.match(importRoute, /Content-Length/i);
assert.match(importRoute, /MAX_ARCHIVE_BYTES/);
assert.match(transfer, /deleteObjectsBestEffort/);
assert.ok(transfer.indexOf("putObjectBytes") < transfer.indexOf("persistProjectImport"));
```

Add pure orchestration tests with injected storage/repository adapters: successful import uploads every payload then persists; an upload failure deletes prior keys and never persists; a persistence failure deletes every uploaded key. Expose `createProjectTransferService(dependencies)` for these tests and construct the route-facing `exportProjectArchive`/`importProjectArchive` wrappers from the production dependencies.

- [ ] **Step 2: Run route tests and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-transfer-routes.test.mjs
```

Expected: FAIL because the service and routes do not exist.

- [ ] **Step 3: Add byte-oriented R2 helpers**

```ts
export async function putObjectBytes(
  key: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<void> {
  await bucket().put(key, bytes, { httpMetadata: { contentType } });
}

export async function readObjectBytes(key: string): Promise<Uint8Array | null> {
  const object = await getObject(key);
  if (!object) return null;
  const reader = object.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
```

- [ ] **Step 4: Implement export/import orchestration with cleanup**

Export loads the source model, reads each declared R2 object, checks recorded size, computes checksums, constructs the manifest, encodes ZIP bytes, and enforces 50/100 MiB limits before returning.

Import decodes and validates before generating its plan, uploads every payload to its planned fresh key, and calls `persistProjectImport`. Track successful keys in an array. In `catch`, call `deleteObjectsBestEffort(uploadedKeys)` before rethrowing. After persistence, return `loadWorkspaceSnapshot(identity)` and the new ID.

- [ ] **Step 5: Implement routes with safe headers and errors**

The GET route awaits dynamic params, calls export, and returns:

```ts
return new Response(bytes, {
  headers: downloadHeaders({
    filename,
    contentType: "application/zip",
    sizeBytes: bytes.byteLength,
  }),
});
```

The POST route rejects an absent/non-ZIP content type and a declared
`Content-Length` above 50 MiB. It reads `request.body` chunk-by-chunk through a
`readRequestBytes(stream, MAX_ARCHIVE_BYTES)` helper that aborts as soon as the
actual byte count exceeds the limit, rather than calling unbounded
`request.arrayBuffer()`. It imports the bounded bytes and returns status 201
with private/no-store headers. Both routes use `errorResponse` and never expose
raw storage/SQL errors.

- [ ] **Step 6: Run targeted tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/storage.ts lib/project-transfer.ts app/api/projects tests/project-transfer-routes.test.mjs
git commit -m "feat: expose authenticated project archive routes"
```

---

### Task 6: Accessible project export menus

**Files:**
- Create: `app/components/project-menu.tsx`
- Modify: `app/components/app-shell.tsx`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/globals.css`
- Create: `tests/project-transfer-ui.test.mjs`

**Interfaces:**
- Produces: `ProjectMenu({ project, busy, onExport })` with menu keyboard/focus behavior.
- Consumes: `AppShell.onProjectExport(projectId)`, implemented by `HarborApp` through the GET route.

- [ ] **Step 1: Write failing UI contract tests**

```js
assert.match(shell, /aria-label={`More actions for \$\{project\.name\}`}/);
assert.match(menu, /aria-haspopup="menu"/);
assert.match(menu, /role="menu"/);
assert.match(menu, /role="menuitem"/);
assert.match(menu, /Export project/);
assert.match(menu, /ArrowDown|ArrowUp/);
assert.match(menu, /Escape/);
assert.match(harbor, /\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/archive/);
assert.match(harbor, /URL\.createObjectURL/);
```

Assert desktop and mobile project maps both render the menu and that the select button remains separate.

- [ ] **Step 2: Run UI tests and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-transfer-ui.test.mjs
```

Expected: FAIL because no project menu or export callback exists.

- [ ] **Step 3: Implement the reusable accessible menu**

Use a wrapper ref, trigger ref, menu ref, local `open`, document pointerdown listener, and keydown handler. Opening focuses the first menuitem. ArrowDown/ArrowUp wrap through enabled items. Escape closes and restores trigger focus. Outside click closes without stealing focus. The export handler closes the menu before awaiting `onExport`.

- [ ] **Step 4: Integrate separate desktop and mobile controls**

Refactor each project row to a `.project-nav-row` containing the existing navigation button and `ProjectMenu`. Do the same inside mobile More. Add `onProjectExport` and `exportingProjectId` props to `AppShell`; menus disable only while their project exports.

- [ ] **Step 5: Implement the browser download**

In `HarborApp`, fetch the project route, parse JSON errors with the existing safe response pattern, create a Blob URL, derive the filename from `Content-Disposition` with a safe fallback, click a temporary `<a download>`, revoke the URL, and show an error toast on failure. Maintain `exportingProjectId` in `finally`.

- [ ] **Step 6: Add responsive menu styles**

Add focused styles for `.project-nav-row`, `.project-menu-trigger`, `.project-context-menu`, hover/focus visibility, 44px mobile targets, high stacking order, and active-project backgrounds without altering the global navigation grid.

- [ ] **Step 7: Run UI tests**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add app/components/project-menu.tsx app/components/app-shell.tsx app/components/harbor-app.tsx app/globals.css tests/project-transfer-ui.test.mjs
git commit -m "feat: add project export menus"
```

---

### Task 7: New-project modal import flow

**Files:**
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/project-transfer-ui.test.mjs`

**Interfaces:**
- Consumes: `POST /api/projects/import` result `{ snapshot: WorkspaceSnapshot; projectId: string }`.
- Produces: modal file input flow that selects the imported project and updates navigation.

- [ ] **Step 1: Extend the failing UI tests**

```js
assert.match(harbor, /Import project/);
assert.match(harbor, /Choose project archive/);
assert.match(harbor, /accept="\.harbor\.zip,\.zip,application\/zip"/);
assert.match(harbor, /fetch\("\/api\/projects\/import"/);
assert.match(harbor, /Project imported/);
assert.match(harbor, /Importing…/);
assert.match(styles, /\.project-import-section/);
```

- [ ] **Step 2: Run UI tests and verify the new assertions fail**

Run the Task 6 UI-test command. Expected: FAIL on the import labels and endpoint.

- [ ] **Step 3: Implement raw-ZIP import state and request flow**

Add `importing` state and a `useRef<HTMLInputElement>`. On change, require the first file, POST it as the raw body with `Content-Type: application/zip`, parse `{ snapshot, projectId }`, call `acceptSnapshot`, set active project and its first collection, set route to project, push `/projects/:id`, close the modal, and show `Project imported`. On failure, keep the modal open and show an error toast. In `finally`, clear `input.value` and `importing`.

- [ ] **Step 4: Add the import section and busy states**

Place a semantic separator below the create form:

```tsx
<section className="project-import-section" aria-labelledby="project-import-title">
  <div>
    <h3 id="project-import-title">Import project</h3>
    <p>A Harbor archive creates a new project owned by you.</p>
  </div>
  <label className={`button button-secondary ${importing ? "disabled" : ""}`}>
    {importing ? "Importing…" : "Choose project archive"}
    <input ref={importInputRef} className="sr-only" type="file"
      accept=".harbor.zip,.zip,application/zip" disabled={pending || importing}
      onChange={importProject} />
  </label>
</section>
```

Disable the project creation inputs and actions while importing, and disable import while an ordinary mutation is pending.

- [ ] **Step 5: Add responsive styles and run UI tests**

Style the section with a top border, grid/flex layout, muted explanatory copy, visible keyboard focus, and stacked mobile layout. Run the Task 6 UI-test command. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/harbor-app.tsx app/globals.css tests/project-transfer-ui.test.mjs
git commit -m "feat: import Harbor archives from new project dialog"
```

---

### Task 8: End-to-end verification and cleanup

**Files:**
- Modify only files required by failures found in this task.

**Interfaces:**
- Consumes: all prior tasks.
- Produces: verified complete feature with no partial/archive/access regressions.

- [ ] **Step 1: Apply the local migration and exercise a real round trip**

Run:

```bash
npm run dev:setup
npm run dev
```

In the browser, export a project containing at least one task, event, relation, payment, attachment, and receipt. Import the downloaded `.harbor.zip`. Verify a new project appears with fresh URL/IDs, matching content and bytes, importer ownership, imported attribution labels, and no copied members/invitations. Import it a second time and verify a second independent project appears.

- [ ] **Step 2: Exercise failure and accessibility paths**

Verify a damaged ZIP, renamed non-ZIP, checksum mismatch, unsupported version, and archive over the test-configured limit all leave no project and show a safe error. Verify desktop and mobile export menus, outside click, Escape, ArrowDown/ArrowUp, focus restoration, import retry, and busy-state duplicate prevention.

- [ ] **Step 3: Run focused transfer tests**

```bash
node --experimental-strip-types --test tests/project-archive.test.mjs tests/project-archive-zip.test.mjs tests/project-transfer-repository.test.mjs tests/project-transfer-routes.test.mjs tests/project-transfer-ui.test.mjs
```

Expected: PASS.

- [ ] **Step 4: Run static checks**

```bash
npm run lint
npm run build
```

Expected: both commands exit 0 and the Sites artifact validator passes.

- [ ] **Step 5: Run the full suite**

```bash
npm test
```

Expected: build, artifact validation, and every `tests/*.test.mjs` test pass.

- [ ] **Step 6: Review the final diff against the approved spec**

Check every product decision, archive field, validation rule, route, UI entry point, cleanup invariant, attribution rule, and out-of-scope boundary in `docs/superpowers/specs/2026-07-22-project-import-export-design.md`. Remove debug output and verify `git diff --check` is clean.

- [ ] **Step 7: Commit final verification fixes**

If verification required edits, commit only the feature paths changed by this
plan:

```bash
git add app db drizzle lib tests package.json package-lock.json
git commit -m "fix: complete project archive verification"
```
