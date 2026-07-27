# Uploaded file renaming design

## Goal

Let authorized users rename every kind of uploaded file shown in an item's
Files tab without changing the file's extension, contents, or object-storage
location.

## Interaction

Every file row that the current user may manage exposes a Rename action.
Selecting it replaces the displayed filename with an inline form containing:

- a text input prefilled with the editable base name;
- the current extension rendered beside the input as locked text;
- Save and Cancel actions.

Save keeps the editor open while the request is pending, disables repeated
submissions, and returns the row to its normal state with the new name after a
successful response. Cancel discards the draft without making a request. A
failed save keeps the editor and draft visible and reports the server error in
the item's existing inline error area.

The Rename action is available for ordinary item attachments and payment
receipts. Ordinary attachments follow their existing management rule and may be
renamed by any project member. A receipt may be renamed only by the project
owner or the user who created its payment, matching the existing receipt
removal and replacement rules. Users who may download but not manage a receipt
do not see Rename for that receipt.

## Filename rules

The extension is the final non-empty suffix beginning with the last dot, when
that dot is not the first character. For example:

- `report.pdf` splits into `report` and `.pdf`;
- `archive.tar.gz` splits into `archive.tar` and `.gz`;
- `README`, `.env`, and `report.` are treated as extensionless.

The extension is preserved exactly, including its original case. The editor
accepts only a new base name. The server reloads the current stored filename,
derives its extension, and combines that locked extension with the submitted
base name; it never accepts a replacement extension from the client.
An extensionless file must remain extensionless: a requested base name that
would introduce a final non-empty suffix is rejected.

The base name is trimmed and must remain non-empty. C0/C1 control characters,
bidirectional formatting controls, `/`, and `\` are rejected. Unicode, spaces,
punctuation, and additional dots are allowed when an existing extension
remains locked. The combined stored filename must be no more than 160
characters, matching the existing upload filename limit. Duplicate filenames
are allowed because file identity remains the file-object ID.
The final constructed name also passes the existing executable-suffix policy.
That check ignores trailing dots and spaces so Windows-normalized forms such as
`.exe` and `run.exe.` cannot be introduced through a rename.

## Data flow and API

No schema migration is needed because `file_objects.filename` already supplies
the Files-tab label and download filename.

A pure shared filename helper splits a stored filename and builds a validated
renamed filename. The Files UI uses the split result to render the editable
base and locked extension. The server uses the same helper as the authoritative
validation boundary.

The client sends `PATCH /api/files?id=<fileObjectId>` with JSON
`{"baseName":"<new base name>"}`. The route authenticates the user, validates
the JSON shape, and delegates to a repository rename operation. The repository
loads the file context, verifies project access, applies the stricter payment
permission check for receipts, updates only `file_objects.filename`, and
returns the refreshed workspace snapshot.

Because downloads already build `Content-Disposition` from the stored
filename, successful renames automatically change the next downloaded
filename. The R2 key, file bytes, MIME type, size, upload attribution,
attachment relationship, receipt relationship, and timestamps remain
unchanged.

## Error handling

Malformed JSON, missing or unknown fields, invalid base names, missing files,
and unauthorized receipt renames use the existing domain-error response
format. A failed update does not change local snapshot state. Concurrent valid
renames use last-write-wins behavior; every update still retains the extension
from the current stored filename.

## Testing and verification

Tests prove that:

- filename splitting handles ordinary, multi-dot, extensionless, dotfile, and
  trailing-dot names;
- renaming trims valid base names, preserves the exact extension, rejects
  empty and unsafe names, prevents extensionless files from acquiring a suffix,
  rejects executable names including Windows-normalized forms, and enforces the
  160-character combined limit;
- the PATCH route requires an ID and strict `baseName` JSON input;
- repository renames update only filename metadata, permit project members to
  rename attachments, and enforce existing receipt-management permissions;
- the Files UI exposes inline Rename, Save, and Cancel behavior for both file
  kinds when authorized, keeps the extension visibly locked, and surfaces
  failed saves without discarding the draft;
- a refreshed snapshot and subsequent download use the renamed filename.

Run focused filename, mutation/repository, API, and Files UI tests first. Then
run the complete test suite, lint, and production build. Render and inspect the
Files tab at desktop and mobile widths, including normal rows, an active editor,
a long filename, and an error state.
