# Chunked File Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make attachments and receipts up to 5 MiB upload reliably through the deployed Sites gateway while preserving ordinary single-file downloads.

**Architecture:** The client initiates an authenticated upload session, transfers raw 512 KiB chunks, and asks the server to assemble them into one final R2 object before existing D1 metadata is created. A focused protocol module owns constants, manifest validation, chunk sizing, and assembly; the API route owns authorization and orchestration; the client owns sequential transfer and progress.

**Tech Stack:** TypeScript, React 19, Next-compatible route handlers, Cloudflare Workers, R2, D1, Node test runner

## Global Constraints

- The maximum attachment and receipt size is exactly `5 * 1024 * 1024` bytes.
- The transport chunk size is exactly `512 * 1024` bytes.
- Every upload stage must authenticate the caller and verify current target access.
- The final stored object and downloaded bytes must be identical to the selected file.
- D1 file metadata must be created only after the final R2 object is stored.
- Temporary and incomplete final objects must be deleted best-effort after success, cancellation, or failure.
- Existing project archive import/export limits and routes must not change.
- Downloads must continue to return one file with the original filename and content type.

---

### Task 1: Define the 5 MiB policy and chunk protocol

**Files:**
- Create: `lib/chunked-upload.ts`
- Modify: `lib/upload-policy.ts`
- Modify: `tests/api-contract.test.mjs`
- Create: `tests/chunked-upload.test.mjs`

**Interfaces:**
- Consumes: `DomainError` from `lib/domain.ts`
- Produces: `MAX_UPLOAD_BYTES`, `UPLOAD_CHUNK_BYTES`, `UploadSessionManifest`, `expectedChunkCount(sizeBytes)`, `expectedChunkSize(sizeBytes, index)`, `uploadManifestKey(uploadId)`, `uploadChunkKey(uploadId, index)`, `parseUploadSessionManifest(value)`, and `assembleUploadChunks(manifest, chunks)`

- [ ] **Step 1: Write failing upload-policy tests**

Add assertions proving that an attachment and a receipt at exactly
`5 * 1024 * 1024` bytes pass, while either kind at one byte more throws an
error containing `5 MB`.

- [ ] **Step 2: Write failing protocol tests**

Cover these exact cases in `tests/chunked-upload.test.mjs`:

```js
assert.equal(expectedChunkCount(1), 1);
assert.equal(expectedChunkCount(512 * 1024), 1);
assert.equal(expectedChunkCount(512 * 1024 + 1), 2);
assert.equal(expectedChunkCount(5 * 1024 * 1024), 10);
assert.equal(expectedChunkSize(512 * 1024 + 1, 0), 512 * 1024);
assert.equal(expectedChunkSize(512 * 1024 + 1, 1), 1);
```

Also assert that invalid UUIDs, targets with both/neither IDs, sizes above
5 MiB, inconsistent chunk counts, negative indexes, and malformed identities
are rejected; valid chunk bytes assemble in index order.

- [ ] **Step 3: Run the focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/api-contract.test.mjs tests/chunked-upload.test.mjs
```

Expected: FAIL because the new constants and protocol module do not exist and
the current receipt/attachment limits are not 5 MiB.

- [ ] **Step 4: Implement the protocol module and policy limit**

Use `512 * 1024` byte chunks, zero-padded six-digit chunk indexes, strict
plain-object parsing, and checked integer arithmetic. Store manifests beneath
`_upload-manifests/` and chunks beneath `_upload-parts/` so stale-manifest
listing never scans part objects. `assembleUploadChunks` must preallocate
exactly `manifest.sizeBytes`, reject every unexpected chunk length, and verify
the final offset equals the declared size.

- [ ] **Step 5: Run the focused tests and verify GREEN**

Run the command from Step 3. Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add lib/chunked-upload.ts lib/upload-policy.ts tests/api-contract.test.mjs tests/chunked-upload.test.mjs
git commit -m "feat: define chunked upload protocol"
```

---

### Task 2: Add temporary-object storage primitives

**Files:**
- Modify: `lib/storage.ts`
- Create: `tests/chunked-storage-contract.test.mjs`

**Interfaces:**
- Consumes: existing `bucket()`, `deleteObjectsBestEffort`, and protocol keys
- Produces: `putObjectBytes(key, bytes, contentType)`, `readObjectBytes(key)`, `listObjectKeys(prefix, limit, cursor?)`, and `deleteUploadObjectsBestEffort(manifest)`

- [ ] **Step 1: Write the failing storage contract test**

Assert that storage exposes bounded prefix listing through
`bucket().list({ prefix, limit, cursor })`, preserves the existing byte put/read
helpers, and derives cleanup keys only from a validated manifest and its
expected chunk count.

- [ ] **Step 2: Run the focused test and verify RED**

```bash
node --test tests/chunked-storage-contract.test.mjs
```

Expected: FAIL because bounded listing and upload cleanup do not exist.

- [ ] **Step 3: Implement minimal storage helpers**

Return only object keys and the next cursor from listing. Cleanup must include
the manifest key plus every expected chunk key, deduplicate keys, and reuse the
existing two-attempt `Promise.allSettled` deletion behavior.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/storage.ts tests/chunked-storage-contract.test.mjs
git commit -m "feat: add temporary upload storage helpers"
```

---

### Task 3: Implement authenticated upload stages

**Files:**
- Modify: `app/api/files/route.ts`
- Create: `lib/file-upload-service.ts`
- Create: `tests/file-upload-service.test.mjs`
- Modify: `tests/storage-cleanup-contract.test.mjs`

**Interfaces:**
- Consumes: protocol helpers, storage helpers, `authorizeFileTarget`, `createFileMetadata`, `loadWorkspaceSnapshot`, `validateUpload`
- Produces: `createFileUploadService(dependencies)` with `initiate`, `storeChunk`, `complete`, `cancel`, and `cleanupExpired`; the route-facing service uses production dependencies

- [ ] **Step 1: Write failing service tests with in-memory adapters**

Test these behaviors without mocking the behavior under test:

- initiation validates and authorizes before writing a manifest;
- a chunk requires the same identity and current target authorization;
- wrong indexes and lengths never write an object;
- completion reads every chunk in order, stores one byte-identical final object,
  then creates metadata;
- missing chunks never create metadata;
- storage failure deletes known temporary objects and creates no metadata;
- metadata failure deletes the incomplete final object and temporary objects;
- successful completion deletes temporary objects;
- cancellation cannot delete another user's session;
- expired-session cleanup lists only the `_upload-manifests/` prefix and
  processes only the configured bounded page;
- receipt replacement returns and deletes the replaced R2 key.

- [ ] **Step 2: Run service tests and verify RED**

```bash
node --experimental-strip-types --test tests/file-upload-service.test.mjs
```

Expected: FAIL because `createFileUploadService` does not exist.

- [ ] **Step 3: Implement the service**

Keep HTTP parsing out of the service. Inject identity lookup, authorization,
R2 operations, metadata creation, snapshot loading, clock, and UUID generation.
Store `createdAt` as ISO 8601 and treat sessions older than 24 hours as expired.
Authorize again during chunk, completion, and cancellation.

- [ ] **Step 4: Run service tests and verify GREEN**

Run the command from Step 2. Expected: all service tests pass.

- [ ] **Step 5: Write failing route contract assertions**

Assert that `POST` dispatches only the exact stages `init`, `chunk`, and
`complete`; chunk bodies use `request.arrayBuffer()` rather than
`request.formData()`; `DELETE` distinguishes `uploadId` cancellation from
existing `id` file deletion; and every caught error passes through
`errorResponse`.

- [ ] **Step 6: Run route contracts and verify RED**

```bash
node --test tests/storage-cleanup-contract.test.mjs
```

Expected: FAIL because the route still implements one multipart upload.

- [ ] **Step 7: Wire the route to the service**

For `init`, parse a small JSON descriptor. For `chunk`, parse and bounds-check
the numeric index before reading the body. For `complete`, require no file body.
Return `{ uploadId, chunkSize: UPLOAD_CHUNK_BYTES }` from initiation, a small
JSON acknowledgement from each chunk, and the workspace snapshot from
completion. Preserve current GET, PATCH, and ordinary DELETE behavior.

- [ ] **Step 8: Run route and service tests and verify GREEN**

```bash
node --experimental-strip-types --test tests/file-upload-service.test.mjs tests/storage-cleanup-contract.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 9: Commit**

```bash
git add app/api/files/route.ts lib/file-upload-service.ts tests/file-upload-service.test.mjs tests/storage-cleanup-contract.test.mjs
git commit -m "feat: add authenticated chunk upload routes"
```

---

### Task 4: Replace the browser multipart upload

**Files:**
- Create: `lib/upload-client.ts`
- Modify: `app/components/harbor-app.tsx`
- Create: `tests/upload-client.test.mjs`
- Modify: `tests/attachment-layout-contract.test.mjs`

**Interfaces:**
- Consumes: `UPLOAD_CHUNK_BYTES`, the staged `/api/files` route, and `WorkspaceSnapshot`
- Produces: `uploadFileInChunks(input)` accepting target, `File`, request adapter, and progress callback; resolves to `WorkspaceSnapshot`

- [ ] **Step 1: Write failing client tests**

Using a request adapter that records real request inputs, prove that:

- a 1,172,000-byte file is sliced into three sequential requests of
  524,288, 524,288, and 123,424 bytes;
- the init request precedes chunks and completion follows the last chunk;
- progress is based on acknowledged bytes and reaches 100 only after completion;
- a failed chunk prevents completion and triggers upload-session cancellation;
- a JSON error message is preserved;
- status 413 with an empty body becomes
  `The upload is too large for Project Harbor`;
- another non-JSON failure becomes `The upload could not be completed`;
- a file above 5 MiB is rejected before initiation.

- [ ] **Step 2: Run client tests and verify RED**

```bash
node --experimental-strip-types --test tests/upload-client.test.mjs
```

Expected: FAIL because `uploadFileInChunks` does not exist.

- [ ] **Step 3: Implement the transport helper**

Send chunks sequentially with `fetch` and `application/octet-stream`. Do not add
`Content-Type: multipart/form-data`. Parse responses through one safe helper
that tolerates empty and plain-text bodies. Attempt cancellation in `catch`
without replacing the primary error if cancellation fails.

- [ ] **Step 4: Run client tests and verify GREEN**

Run the command from Step 2. Expected: all client tests pass.

- [ ] **Step 5: Replace `HarborApp.upload`**

Remove the single `XMLHttpRequest` and `FormData` upload. Call
`uploadFileInChunks`, map its progress callback to `setUploadProgress`, keep
`acceptSnapshot`, success/error toasts, pending state, and final progress reset
unchanged.

- [ ] **Step 6: Run focused UI contracts**

```bash
node --experimental-strip-types --test tests/upload-client.test.mjs tests/attachment-layout-contract.test.mjs
```

Expected: all focused tests pass and no contract references the old multipart
transport.

- [ ] **Step 7: Commit**

```bash
git add lib/upload-client.ts app/components/harbor-app.tsx tests/upload-client.test.mjs tests/attachment-layout-contract.test.mjs
git commit -m "feat: upload files in gateway-safe chunks"
```

---

### Task 5: Verify, publish, and open the pull request

**Files:**
- Modify only files required by a verification failure attributable to this change

**Interfaces:**
- Consumes: completed Tasks 1–4
- Produces: verified build artifact, deployed private Sites version, and GitHub pull request

- [ ] **Step 1: Run the full automated test suite**

```bash
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 2: Run lint and artifact validation**

```bash
npm run lint
npm run validate:artifact
git diff --check
```

Expected: all commands exit 0 and `git diff --check` prints nothing.

- [ ] **Step 3: Inspect the final change set**

```bash
git status --short
git diff --stat origin/main...HEAD
git diff origin/main...HEAD -- app/api/files/route.ts lib/file-upload-service.ts lib/chunked-upload.ts lib/upload-client.ts lib/upload-policy.ts lib/storage.ts
```

Confirm that archive routes, download semantics, and unrelated UI behavior did
not change.

- [ ] **Step 4: Build and package the exact source**

Run the repository build, commit any verification-only corrections, push the
branch, and package the pushed `HEAD` with the Sites packaging helper. Use that
exact commit SHA and archive when saving the Sites version.

- [ ] **Step 5: Deploy privately and wait for success**

Save one Sites version for project
`appgprj_6a574dedf0108191988d768839471114`, deploy it with owner-only access,
and poll until the deployment reports `succeeded`.

- [ ] **Step 6: Verify the original production symptom**

Upload:

`C:/Users/alexs/OneDrive/Documents/House/Gidron/1_migrash/2_zhiya/mas_ahnasa_atzarat_rohesh_karka.pdf`

Confirm:

- progress advances and completes;
- the Files count increases;
- the attachment appears with its original filename;
- download returns one PDF;
- downloaded bytes match the source SHA-256;
- deleting the attachment removes it normally;
- a generated file of `5 * 1024 * 1024 + 1` bytes is rejected before transfer
  with a 5 MB message.

- [ ] **Step 7: Open the pull request**

Push `fix/file-upload-response` and open a pull request against `main` titled
`Fix file uploads through the Sites gateway`. Include the observed 413 root
cause, 5 MiB product limit, chunk protocol, cleanup behavior, test evidence,
and successful production verification.

- [ ] **Step 8: Follow repository merge workflow**

After the pull request is confirmed merged, switch back to `main` and run:

```bash
git pull --rebase
```
