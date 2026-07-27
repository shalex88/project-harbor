# Uploaded File Renaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let authorized users rename attachments and payment receipts from the Files tab while preserving each stored extension.

**Architecture:** Put filename splitting, strict request parsing, and locked-extension validation in one pure shared module. Add an authenticated `PATCH /api/files` path whose repository operation updates only `file_objects.filename`, then connect it to an inline editor whose visibility follows the existing attachment and receipt permission rules.

**Tech Stack:** TypeScript 5.9, React 19, Next/Vinext route handlers, Cloudflare D1, Node test runner, ESLint.

## Global Constraints

- Authorized users can rename ordinary item attachments and payment receipts.
- Only the base name is editable; the current extension is visibly locked.
- The server reloads and preserves the stored extension rather than trusting the client.
- The last non-empty suffix is the extension; `.env`, `README`, and `report.` are extensionless.
- Base names are trimmed, required, and reject control characters, `/`, and `\`.
- Combined filenames remain at most 160 characters.
- Duplicate filenames remain allowed.
- Renaming changes only `file_objects.filename`; bytes, R2 keys, relationships, MIME type, size, attribution, and timestamps remain unchanged.
- Any project member can rename an ordinary attachment.
- Only a project owner or the payment creator can rename a receipt.
- Failed saves retain the inline editor and its draft.
- Successful renames refresh the workspace snapshot and subsequent download name.

---

### Task 1: Locked-extension filename rules

**Files:**
- Create: `lib/file-renaming.ts`
- Create: `tests/file-renaming.test.mjs`

**Interfaces:**
- Produces: `splitFilename(filename: string): { baseName: string; extension: string }`.
- Produces: `parseFileRenameInput(input: unknown): { baseName: string }`.
- Produces: `renamedFilename(currentFilename: string, requestedBaseName: string): string`.
- Consumes: `DomainError` from `lib/domain.ts`.

- [ ] **Step 1: Write the failing filename behavior tests**

Create `tests/file-renaming.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import {
  parseFileRenameInput,
  renamedFilename,
  splitFilename,
} from "../lib/file-renaming.ts";
import { downloadHeaders } from "../lib/storage.ts";

test("filename splitting locks only the final non-empty extension", () => {
  assert.deepEqual(splitFilename("report.pdf"), {
    baseName: "report",
    extension: ".pdf",
  });
  assert.deepEqual(splitFilename("archive.tar.GZ"), {
    baseName: "archive.tar",
    extension: ".GZ",
  });
  assert.deepEqual(splitFilename("README"), {
    baseName: "README",
    extension: "",
  });
  assert.deepEqual(splitFilename(".env"), {
    baseName: ".env",
    extension: "",
  });
  assert.deepEqual(splitFilename("report."), {
    baseName: "report.",
    extension: "",
  });
});

test("rename input accepts exactly one string baseName field", () => {
  assert.deepEqual(parseFileRenameInput({ baseName: "Quarterly plan" }), {
    baseName: "Quarterly plan",
  });
  assert.throws(() => parseFileRenameInput(null), /object/i);
  assert.throws(() => parseFileRenameInput({}), /file name is required/i);
  assert.throws(
    () => parseFileRenameInput({ baseName: "plan", extension: ".txt" }),
    /unsupported field/i,
  );
});

test("renaming trims the base and preserves the exact stored extension", () => {
  assert.equal(
    renamedFilename("archive.tar.GZ", "  final.archive  "),
    "final.archive.GZ",
  );
  assert.equal(renamedFilename("README", " Release notes "), "Release notes");
  assert.equal(renamedFilename(".env", "production"), "production");
});

test("renaming rejects empty, unsafe, and overlong final names", () => {
  assert.throws(() => renamedFilename("report.pdf", "   "), /required/i);
  assert.throws(() => renamedFilename("report.pdf", "../secret"), /unsafe/i);
  assert.throws(() => renamedFilename("report.pdf", "bad\u0000name"), /unsafe/i);
  assert.throws(
    () => renamedFilename("report.pdf", "x".repeat(157)),
    /160 characters or less/i,
  );
  assert.equal(
    renamedFilename("report.pdf", "x".repeat(156)),
    `${"x".repeat(156)}.pdf`,
  );
});

test("download headers use the renamed metadata filename", () => {
  const headers = downloadHeaders({
    filename: "Quarterly plan.pdf",
    contentType: "application/pdf",
    sizeBytes: 42,
  });
  assert.match(
    headers.get("Content-Disposition") ?? "",
    /filename\*=UTF-8''Quarterly%20plan\.pdf/,
  );
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/file-renaming.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `lib/file-renaming.ts`.

- [ ] **Step 3: Implement the minimal shared filename module**

Create `lib/file-renaming.ts`:

```ts
import { DomainError } from "./domain.ts";

const MAX_FILENAME_LENGTH = 160;
const UNSAFE_BASE_NAME = /[\/\\\u0000-\u001f\u007f]/;

type RenameInput = { baseName: string };

export function splitFilename(filename: string): {
  baseName: string;
  extension: string;
} {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return { baseName: filename, extension: "" };
  }
  return {
    baseName: filename.slice(0, dot),
    extension: filename.slice(dot),
  };
}

export function parseFileRenameInput(input: unknown): RenameInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Request body must be an object");
  }
  const value = input as Record<string, unknown>;
  const unknown = Object.keys(value).find((key) => key !== "baseName");
  if (unknown) throw new DomainError(`unsupported field: ${unknown}`);
  if (typeof value.baseName !== "string") {
    throw new DomainError("File name is required");
  }
  return { baseName: value.baseName };
}

export function renamedFilename(
  currentFilename: string,
  requestedBaseName: string,
): string {
  const baseName = requestedBaseName.trim();
  if (!baseName) throw new DomainError("File name is required");
  if (UNSAFE_BASE_NAME.test(baseName)) {
    throw new DomainError("File name contains unsafe characters");
  }
  const { extension } = splitFilename(currentFilename);
  const filename = `${baseName}${extension}`;
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw new DomainError("File name must be 160 characters or less");
  }
  return filename;
}
```

- [ ] **Step 4: Run the test and verify GREEN**

Run:

```bash
node --experimental-strip-types --test tests/file-renaming.test.mjs
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit the filename boundary**

```bash
git add lib/file-renaming.ts tests/file-renaming.test.mjs
git commit -m "feat: validate locked-extension file renames"
```

---

### Task 2: Authenticated filename metadata update

**Files:**
- Modify: `app/api/files/route.ts`
- Modify: `lib/repository.ts`
- Create: `tests/file-renaming-contract.test.mjs`

**Interfaces:**
- Consumes: `parseFileRenameInput(input)` and `renamedFilename(currentFilename, requestedBaseName)` from Task 1.
- Produces: `renameFileMetadata(identity: IdentityUser, fileId: string, baseName: string): Promise<WorkspaceSnapshot>`.
- Produces: `PATCH /api/files?id=<fileObjectId>` returning a refreshed `WorkspaceSnapshot`.

- [ ] **Step 1: Write the failing route and repository contract tests**

Create `tests/file-renaming-contract.test.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const route = await readFile(new URL("app/api/files/route.ts", root), "utf8");
const repository = await readFile(
  new URL("lib/repository.ts", root),
  "utf8",
);

test("the protected files route accepts strict PATCH rename requests", () => {
  assert.match(route, /export async function PATCH\(request: Request\)/);
  assert.match(route, /requireAppUser\(\)/);
  assert.match(route, /parseFileRenameInput\(body\)/);
  assert.match(route, /renameFileMetadata\(\s*identity,\s*fileId,\s*baseName/);
  assert.match(route, /Request body must be valid JSON/);
});

test("repository rename preserves storage and enforces receipt permissions", () => {
  const rename = repository.slice(
    repository.indexOf("export async function renameFileMetadata"),
    repository.indexOf("export async function deleteFileMetadata"),
  );
  assert.match(rename, /getFileContext\(fileId\)/);
  assert.match(rename, /requireProjectAccess\(user\.id, context\.projectId\)/);
  assert.match(rename, /context\.paymentId/);
  assert.match(rename, /paymentContext\(context\.paymentId\)/);
  assert.match(rename, /canManagePayment\(actor, payment\)/);
  assert.match(rename, /You cannot rename this receipt/);
  assert.match(rename, /renamedFilename\(context\.filename, baseName\)/);
  assert.match(
    rename,
    /UPDATE file_objects SET filename = \? WHERE id = \?/,
  );
  assert.doesNotMatch(rename, /r2_key\s*=|DELETE FROM|putObject|deleteObject/);
  assert.match(rename, /loadWorkspaceSnapshot\(identity\)/);
});
```

- [ ] **Step 2: Run the focused contracts and verify RED**

Run:

```bash
node --experimental-strip-types --test \
  tests/file-renaming.test.mjs \
  tests/file-renaming-contract.test.mjs
```

Expected: filename tests pass and both contract tests fail because PATCH and
`renameFileMetadata` do not exist.

- [ ] **Step 3: Add the repository rename operation**

Import `renamedFilename` into `lib/repository.ts`, then insert immediately
before `deleteFileMetadata`:

```ts
export async function renameFileMetadata(
  identity: IdentityUser,
  fileId: string,
  baseName: string,
): Promise<WorkspaceSnapshot> {
  await ensurePreviewSchema();
  const user = await syncUser(identity);
  const context = await getFileContext(fileId);
  const actor = await requireProjectAccess(user.id, context.projectId);
  if (context.paymentId) {
    const payment = await paymentContext(context.paymentId);
    if (!canManagePayment(actor, payment)) {
      throw new DomainError("You cannot rename this receipt", "forbidden");
    }
  }
  const filename = renamedFilename(context.filename, baseName);
  await run(
    "UPDATE file_objects SET filename = ? WHERE id = ?",
    filename,
    fileId,
  );
  return loadWorkspaceSnapshot(identity);
}
```

- [ ] **Step 4: Add the authenticated PATCH route**

Import `parseFileRenameInput` and `renameFileMetadata` in
`app/api/files/route.ts`. Add:

```ts
export async function PATCH(request: Request) {
  try {
    const identity = await requireAppUser();
    const fileId = new URL(request.url).searchParams.get("id");
    if (!fileId) throw new DomainError("File is required");
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new DomainError("Request body must be valid JSON");
    }
    const { baseName } = parseFileRenameInput(body);
    return Response.json(
      await renameFileMetadata(identity, fileId, baseName),
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return errorResponse(error);
  }
}
```

- [ ] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test \
  tests/file-renaming.test.mjs \
  tests/file-renaming-contract.test.mjs \
  tests/authorization.test.mjs \
  tests/storage-cleanup-contract.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit the protected metadata update**

```bash
git add \
  app/api/files/route.ts \
  lib/repository.ts \
  tests/file-renaming-contract.test.mjs
git commit -m "feat: add protected file rename endpoint"
```

---

### Task 3: Permission-aware inline rename editor

**Files:**
- Modify: `lib/item-uploaded-files.ts`
- Modify: `app/components/item-sheet.tsx`
- Modify: `app/components/harbor-app.tsx`
- Modify: `app/globals.css`
- Modify: `tests/receipt-files-ui.test.mjs`

**Interfaces:**
- Consumes: `splitFilename(filename)` from Task 1.
- Produces: `UploadedItemFile.renameable: boolean`.
- Produces: `onRenameFile(fileObjectId: string, baseName: string): Promise<void>` from `HarborApp` through `ItemSheet`.
- Consumes: `PATCH /api/files?id=<fileObjectId>` from Task 2.

- [ ] **Step 1: Write failing permission and UI contract tests**

Extend `tests/receipt-files-ui.test.mjs` to pass
`{ userId: "user-1", role: "member" }` as the third
`buildUploadedFiles` argument and include `renameable` in the mapped
assertion. The existing attachment and own receipt must both return
`renameable: true`.

Add:

```js
const harborSource = await readFile(
  new URL("app/components/harbor-app.tsx", root),
  "utf8",
);

test("uploaded file rename permissions cover attachments and manageable receipts", () => {
  const attachments = [
    {
      id: "item-file-1",
      itemId: "item-1",
      fileObjectId: "file-1",
      filename: "plans.pdf",
      contentType: "application/pdf",
      sizeBytes: 2048,
      uploadedBy: "user-2",
      uploadedByName: "Teammate",
      createdAt: "2026-07-02T10:00:00.000Z",
    },
  ];
  const payments = [
    {
      id: "payment-1",
      itemId: "item-1",
      amountMinor: 100,
      paidOn: "2026-07-02",
      note: "Fee",
      createdBy: "user-2",
      createdByName: "Teammate",
      receiptFileId: "receipt-1",
      receiptFilename: "receipt.pdf",
      receiptCreatedAt: "2026-07-03T10:00:00.000Z",
      createdAt: "2026-07-01T10:00:00.000Z",
      updatedAt: "2026-07-01T10:00:00.000Z",
    },
  ];

  const memberFiles = uploadedFilesModule.buildUploadedFiles(
    attachments,
    payments,
    { userId: "user-1", role: "member" },
  );
  assert.equal(memberFiles[0].renameable, false);
  assert.equal(memberFiles[1].renameable, true);

  const ownerFiles = uploadedFilesModule.buildUploadedFiles(
    attachments,
    payments,
    { userId: "owner", role: "owner" },
  );
  assert.equal(ownerFiles.every((file) => file.renameable), true);
});

test("Files exposes a locked-extension inline rename editor", () => {
  assert.match(itemSource, /splitFilename\(file\.filename\)/);
  assert.match(itemSource, /file\.renameable[\s\S]*?>Rename<\/button>/);
  assert.match(itemSource, /className="file-rename-form"/);
  assert.match(itemSource, /name="baseName"/);
  assert.match(itemSource, /fileNameParts\.extension/);
  assert.match(itemSource, />Save<\/button>/);
  assert.match(itemSource, />Cancel<\/button>/);
  assert.match(itemSource, /await onRenameFile\(file\.fileObjectId, baseName\)/);
});

test("the app sends baseName only and accepts the refreshed snapshot", () => {
  assert.match(harborSource, /method:\s*"PATCH"/);
  assert.match(harborSource, /body:\s*JSON\.stringify\(\{\s*baseName\s*\}\)/);
  assert.match(harborSource, /acceptSnapshot\(next\)/);
  assert.match(harborSource, /onRenameFile=\{renameFile\}/);
});
```

Also load the stylesheet and assert `.file-rename-form`,
`.file-rename-name`, and the mobile two-action `.file-rename-form` layout
exist.

- [ ] **Step 2: Run the UI test and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/receipt-files-ui.test.mjs
```

Expected: FAIL because `renameable`, the inline editor, PATCH client callback,
and rename styles do not exist.

- [ ] **Step 3: Derive rename visibility in the uploaded-file builder**

Import `canManagePayment` and the `ProjectActor` type from
`lib/authorization.ts`.
Add `renameable: boolean` to both `UploadedItemFile` variants. Change
`buildUploadedFiles` to accept `actor: ProjectActor | null`.

For attachments, set `renameable: actor !== null`. For receipts, set:

```ts
renameable: actor ? canManagePayment(actor, payment) : false,
```

Keep the existing merged ordering, `removable`, labels, IDs, and details.

- [ ] **Step 4: Add the client rename callback**

In `app/components/harbor-app.tsx`, add beside `deleteFile`:

```ts
const renameFile = async (fileObjectId: string, baseName: string) => {
  setPending(true);
  try {
    const next = await readResponse(
      await fetch(`/api/files?id=${encodeURIComponent(fileObjectId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseName }),
      }),
    );
    acceptSnapshot(next);
    pushToast("File renamed");
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unable to rename the file";
    pushToast(message, "error");
    throw error;
  } finally {
    setPending(false);
  }
};
```

Pass it to `ItemSheet` as `onRenameFile={renameFile}`.

- [ ] **Step 5: Render the inline editor**

In `app/components/item-sheet.tsx`:

- import `splitFilename`;
- add `onRenameFile` to both component prop types and forwarding;
- add `const [renamingFileId, setRenamingFileId] = useState<string | null>(null)`;
- pass the current actor to `buildUploadedFiles`;
- inside the file-row map, derive
  `const fileNameParts = splitFilename(file.filename)`;
- render the normal title/actions when the row is not being edited;
- render the following form when `renamingFileId === file.fileObjectId`:

```tsx
<form
  className="file-rename-form"
  onSubmit={async (event) => {
    event.preventDefault();
    setLocalError("");
    const baseName = String(
      new FormData(event.currentTarget).get("baseName") ?? "",
    );
    try {
      await onRenameFile(file.fileObjectId, baseName);
      setRenamingFileId(null);
    } catch (error) {
      setLocalError(
        error instanceof Error ? error.message : "Unable to rename the file",
      );
    }
  }}
>
  <label className="file-rename-name">
    <span className="sr-only">File name</span>
    <input
      name="baseName"
      defaultValue={fileNameParts.baseName}
      autoFocus
      disabled={pending}
      aria-label={`Rename ${file.filename}`}
    />
    {fileNameParts.extension ? (
      <span className="file-rename-extension">
        {fileNameParts.extension}
      </span>
    ) : null}
  </label>
  <button className="button button-primary" type="submit" disabled={pending}>
    Save
  </button>
  <button
    className="button button-secondary"
    type="button"
    disabled={pending}
    onClick={() => setRenamingFileId(null)}
  >
    Cancel
  </button>
</form>
```

The normal action group adds:

```tsx
{file.renameable ? (
  <button
    className="button button-secondary"
    type="button"
    disabled={pending}
    onClick={() => {
      setLocalError("");
      setRenamingFileId(file.fileObjectId);
    }}
  >
    Rename
  </button>
) : null}
```

- [ ] **Step 6: Style desktop and mobile editors**

Add desktop rules near the existing file-list styles:

```css
.file-rename-form {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 8px;
}

.file-rename-name {
  display: flex;
  min-width: 0;
  min-height: 40px;
  align-items: center;
  border: 1px solid var(--border-bright);
  border-radius: 7px;
  background: var(--shell);
  overflow: hidden;
}

.file-rename-name:focus-within {
  border-color: var(--seafoam);
}

.file-rename-name input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  background: transparent;
  padding: 0 10px;
}

.file-rename-extension {
  flex: 0 0 auto;
  border-left: 1px solid var(--border);
  color: var(--text-muted);
  padding: 0 10px;
}
```

Inside the existing mobile media query, add:

```css
.file-rename-form {
  grid-template-columns: 1fr 1fr;
}

.file-rename-name {
  grid-column: 1 / -1;
}

.file-rename-form .button {
  min-height: 44px;
}
```

- [ ] **Step 7: Run focused UI tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test \
  tests/file-renaming.test.mjs \
  tests/file-renaming-contract.test.mjs \
  tests/receipt-files-ui.test.mjs \
  tests/authorization.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 8: Commit the inline editor**

```bash
git add \
  app/components/harbor-app.tsx \
  app/components/item-sheet.tsx \
  app/globals.css \
  lib/item-uploaded-files.ts \
  tests/receipt-files-ui.test.mjs
git commit -m "feat: rename uploaded files inline"
```

---

### Task 4: Full verification and visual QA

**Files:**
- Modify only if verification exposes a defect in the files changed above.

**Interfaces:**
- Consumes: the complete filename, API, repository, and inline editor behavior from Tasks 1–3.
- Produces: verified desktop/mobile behavior and a branch ready for review.

- [ ] **Step 1: Run all automated checks**

Run:

```bash
npm test
npm run lint
npm run validate:artifact
git diff --check origin/main...HEAD
```

Expected: production build succeeds, every Node test passes, ESLint reports no
errors or warnings, artifact validation passes, and Git reports no whitespace
errors.

- [ ] **Step 2: Exercise the full rename flow in the development app**

Start the app with `npm run dev`. In a browser:

1. Open an existing item and its Files tab.
2. Upload an ordinary `sample.report.pdf` file if the item has no attachment.
3. Select Rename and confirm that only `sample.report` is editable while
   `.pdf` is visibly locked.
4. Rename it to `Quarterly plan`, save, and confirm the row shows
   `Quarterly plan.pdf`.
5. Download the file and confirm the browser receives
   `Quarterly plan.pdf`.
6. Reopen Rename, submit whitespace, confirm the editor and draft remain
   visible with an inline validation error, then Cancel.
7. Repeat Rename on a receipt owned by the current user and confirm its
   extension is also locked.

- [ ] **Step 3: Inspect responsive layouts**

At a desktop viewport around 1440×900 and a mobile viewport around 390×844,
inspect:

- a normal attachment row;
- a normal receipt row;
- an active rename editor;
- a long base name;
- the inline error state.

Expected: the locked extension remains visible, inputs and buttons do not
overflow, mobile actions meet the existing 44px touch-target convention, and
the Files sheet remains usable without horizontal scrolling.

- [ ] **Step 4: Review and commit verification fixes**

Review `git diff origin/main...HEAD` for unrelated changes and sensitive data.
If visual or automated verification required fixes, rerun the affected focused
test first, then all commands from Step 1, and commit:

```bash
git add app lib tests docs/superpowers
git commit -m "fix: polish uploaded file renaming"
```

If no fixes were required, do not create an empty commit.

- [ ] **Step 5: Push and open the pull request**

```bash
git push -u origin feat/rename-uploaded-files
gh pr create \
  --base main \
  --head feat/rename-uploaded-files \
  --title "Rename uploaded files without changing extensions" \
  --body-file /tmp/project-harbor-file-renaming-pr.md
```

The PR body must summarize locked-extension rename behavior and permissions,
list automated commands run, and report desktop/mobile visual verification.
Confirm the PR URL and check status before handoff.
