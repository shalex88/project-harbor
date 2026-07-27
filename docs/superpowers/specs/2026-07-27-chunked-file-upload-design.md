# Chunked File Upload Design

## Problem

Project Harbor currently sends each attachment or receipt as one multipart
request. The deployed Sites gateway rejects the supplied PDF at 1,172,511
request bytes with HTTP 413 before `app/api/files/route.ts` can parse or store
it. The client then tries to parse the gateway's empty response as JSON and
shows the misleading message `The upload returned an invalid response`.

The application advertises a 25 MB attachment limit and a 10 MB receipt limit,
but those limits cannot be reached through the deployed request path.

## Scope

- Set one 5 MiB (`5 * 1024 * 1024` bytes) maximum for attachments and receipts.
- Upload every accepted file through authenticated 512 KiB chunks.
- Reassemble the chunks into one ordinary R2 object before creating file
  metadata.
- Keep downloads unchanged: callers receive the original single file with its
  original filename and content type.
- Preserve attachment pinning, receipt replacement, workspace snapshots,
  progress reporting, and existing authorization rules.
- Return useful JSON errors for failures produced inside Project Harbor.

Project export/import archives are outside this transport change. Their
existing 25 MiB attachment and 10 MiB receipt limits and raw ZIP routes remain
unchanged through a separate archive-validation policy.

## Architecture

### Shared upload protocol

Add `lib/chunked-upload.ts` as the single definition of the protocol:

- `MAX_UPLOAD_BYTES = 5 * 1024 * 1024`
- `UPLOAD_CHUNK_BYTES = 512 * 1024`
- strict upload-session metadata parsing
- expected chunk count and expected chunk size calculations
- temporary R2 key generation beneath separate manifest and chunk prefixes

The browser always uses the chunked protocol, including for files smaller than
one chunk. This avoids maintaining two upload paths and ensures no accepted file
depends on the gateway's undocumented body threshold.

### Initiation

The client sends a small JSON request to `POST /api/files?stage=init` containing
exactly one target (`itemId` or `paymentId`) plus the filename, MIME type, and
byte size.

The route:

1. authenticates the current user;
2. authorizes the target with `authorizeFileTarget`;
3. validates the file descriptor with the shared upload policy;
4. creates a cryptographically random upload ID;
5. writes a small session manifest to
   `_upload-manifests/<uploadId>.json` in R2; and
6. returns the upload ID and 512 KiB chunk size.

The manifest records the authenticated identity, authorized project and target,
sanitized file metadata, total byte size, expected chunk count, and creation
time. An upload ID alone is never sufficient authorization.

### Chunk transfer

For each chunk, the client sends its raw bytes to:

`POST /api/files?stage=chunk&uploadId=<id>&index=<n>`

The route authenticates the caller, loads the manifest, verifies ownership and
the authorized target, validates the index and exact expected byte length, and
stores the bytes at
`_upload-parts/<uploadId>/<zero-padded-index>`.

At 512 KiB, the request body remains comfortably below the observed failing
request size even after headers. A 5 MiB file requires exactly ten chunk
requests.

### Completion

The client sends an empty `POST /api/files?stage=complete&uploadId=<id>`.
Completion repeats authentication and target authorization, then reads every
expected chunk in order. It rejects missing, duplicated, incorrectly sized, or
over-total chunks.

Before reading chunks, completion conditionally creates
`_upload-claims/<uploadId>.txt` with R2's `If-None-Match: *` equivalent. Only
the request that creates this claim may continue, so retries or concurrent
completion requests cannot create duplicate file metadata. Claims remain until
bounded stale cleanup removes them after 24 hours.

Because the complete file is capped at 5 MiB, the route may safely assemble it
into one `Uint8Array` within the Worker's memory limit. It writes that byte
array to the existing final R2 key, creates the existing D1 file metadata, and
returns the refreshed workspace snapshot. Receipt replacement continues to
delete the replaced receipt object after the new metadata commits.

Temporary chunks and the manifest are deleted best-effort after successful
completion. If final object storage or metadata creation fails, the route also
deletes the incomplete final object and all known temporary objects.

### Cancellation and stale uploads

If any client stage fails, the client sends
`DELETE /api/files?uploadId=<id>`. The route authenticates the caller, verifies
manifest ownership, and deletes the manifest and known chunk objects
best-effort.

Initiation also performs bounded opportunistic cleanup of expired manifests
older than 24 hours. Manifests and chunks use separate prefixes, so cleanup can
list only `_upload-manifests/` and never spend its bounded page on chunk
objects. It examines only one limited manifest page per initiation so it cannot
turn one user upload into an unbounded storage scan. This covers browser
closure and lost-network cases where explicit cancellation never arrives.

Every manifest-based operation also rejects sessions at least 24 hours old and
cleans their temporary objects. Opportunistic cleanup is not the enforcement
boundary for expiration.

## Client behavior

`HarborApp.upload` validates the file locally, initiates a session, sends
sequential chunks, completes the session, accepts the returned snapshot, and
shows the existing success toast.

Progress is computed from confirmed uploaded bytes rather than relying on one
`XMLHttpRequest` progress event. It starts at 0, advances after each chunk, and
reaches 100 only after completion succeeds.

Error parsing accepts both JSON application errors and empty/plain-text gateway
responses. A 413 response produces `The upload is too large for Project
Harbor`; other non-JSON failures produce `The upload could not be completed`.
The item sheet continues to show the error inline.

## Validation and error handling

- Both attachment and receipt policies reject files larger than 5 MiB.
- Empty files and executable file types remain rejected.
- Receipts remain restricted to images and PDFs.
- The server never trusts client chunk counts, byte totals, MIME types, target
  IDs, or upload ownership without checking the stored manifest and current
  authorization.
- Completion creates D1 metadata only after the final R2 object exists.
- Cleanup remains best-effort so an R2 deletion failure does not hide the
  primary upload result.
- Repeated completion after cleanup fails cleanly as an expired or unknown
  upload rather than creating duplicate metadata.

## Testing

Pure tests cover the 5 MiB policy, chunk count/size calculations, manifest
validation, key generation, and ordered byte assembly.

Route contract tests cover the init/chunk/complete/cancel stages,
authentication and target authorization at every stage, exact chunk-length
checks, metadata-after-storage ordering, rollback cleanup, and unchanged
download behavior.

Client contract tests cover 512 KiB slicing, sequential transfer, progress,
completion, cancellation after failure, 413 messaging, and acceptance of the
returned workspace snapshot.

The full build, test suite, lint, and artifact validation must pass. Production
verification uses the supplied 1.2 MB PDF and confirms that upload, listing,
download, and byte-for-byte integrity all succeed.
