# Project Import and Export Design

**Date:** 2026-07-22  
**Status:** Approved for implementation planning

## Goal

Project Harbor users can export one project, including its stored attachments
and payment receipts, to a portable file and import that file as a new,
independent project.

The feature adds import to the existing New project dialog and export to a
project context menu in the desktop sidebar, with an equivalent export action
in the mobile More sheet.

## Product Decisions

- The transfer format is a single ZIP archive using the `.harbor.zip` filename
  suffix.
- An import always creates a new project with fresh database IDs and storage
  keys. It never updates or overwrites an existing project.
- The imported project keeps the archived name, description, currency,
  collections, work items, relations, payments, attachments, and receipts.
- Importing the same archive more than once creates multiple independent
  projects and is safe.
- Project membership, invitations, email addresses, internal user IDs, and
  access credentials are not exported.
- The importing user becomes the owner. Foreign-key actor fields use that
  user's ID. Human-readable creator and uploader names are retained only as
  non-authorizing attribution strings and are labeled as imported wherever the
  application displays them.
- Any user with access to a project can export it. Any signed-in user can
  import a valid archive and becomes the new project's owner.

## Archive Contract

Every archive contains `manifest.json` at its root. File payloads live under
`attachments/` and `receipts/`. No other root entries are allowed.

The manifest has a fixed format identifier and integer version:

```json
{
  "format": "project-harbor-project",
  "version": 1,
  "exportedAt": "2026-07-22T12:00:00.000Z",
  "project": {},
  "collections": [],
  "items": [],
  "relations": [],
  "payments": [],
  "attachments": [],
  "receipts": []
}
```

Archive-local IDs connect records inside the manifest. They are reference
handles only and are never reused as database IDs during import.

The project record contains name, description, and currency. Collection
records contain name, color, position, and timestamps. Item records contain
their collection reference, task/event discriminant, content, workflow/date
fields, estimate, timestamps, and optional non-authorizing creator label.
Relation records contain source and target item references and relation type.
Payment records contain their item reference, amount in integer minor units,
date, note, timestamps, and optional creator label.

Each attachment and receipt record includes its owning item or payment
reference, safe archive path, original filename, content type, byte size,
SHA-256 checksum, timestamps, and the applicable pinned state or optional
uploader label. Binary data is stored once at the referenced path.

The export filename is derived from a sanitized project name and ends in
`.harbor.zip`. Archive entry names are generated independently of user-supplied
filenames so that duplicate filenames cannot collide.

## Server Architecture

Two authenticated routes own the transfer protocol:

- `GET /api/projects/:projectId/archive` exports one authorized project.
- `POST /api/projects/import` accepts one ZIP request body and returns the
  refreshed workspace snapshot plus the new project ID.

Archive schema parsing, validation, ID mapping, and limit enforcement live in
focused transfer modules rather than UI components or the general workspace
mutation parser. Repository functions load a project-scoped export model and
persist a validated import model. Storage helpers read source objects, upload
new objects, and remove staged objects after failures.

A database migration adds nullable imported-attribution label columns to work
items, payments, and file objects. Export resolves each creator or uploader to
a display name only; it never writes an email or user ID to the archive. Import
stores that display name in the applicable imported-attribution column while
setting the existing required actor foreign key to the importing user. Existing
records keep null imported-attribution values. Snapshot queries prefer the
stored imported label, suffixed with `(imported)`, wherever creator or uploader
names are shown or re-exported.

### Export flow

1. Authenticate the request and authorize project access.
2. Query only the selected project's project, collection, item, relation,
   payment, attachment, and receipt records.
3. Fetch each referenced object from R2 and verify that it exists and matches
   the recorded size.
4. Generate SHA-256 checksums and assemble the version-1 manifest.
5. Build the ZIP, enforcing the same aggregate limits accepted by import.
6. Return it as an attachment with `application/zip`, a safe filename, and
   private/no-store cache headers.

An export fails without producing a truncated download when any referenced
object is unavailable or the completed project exceeds the supported archive
limits.

### Import flow

1. Authenticate the request and enforce the compressed request limit before
   parsing.
2. Inspect the ZIP directory and reject unsafe or unsupported entries.
3. Parse and strictly validate `manifest.json`, including format and version.
4. Validate all record references, field constraints, relation invariants,
   declared sizes, checksums, and aggregate limits before creating database
   records.
5. Generate a fresh ID for every database record and a fresh R2 key for every
   stored object. Build complete archive-ID-to-new-ID maps.
6. Upload validated attachment and receipt payloads under the new keys.
7. Insert the project, owner membership, collections, items, relations,
   payments, file metadata, item-file links, and receipt links in one database
   batch/transaction.
8. Return the refreshed snapshot and new project ID.

The project becomes visible only after all storage uploads succeed. If an
upload or database operation fails, the route removes every new R2 object on a
best-effort basis and returns an error. A database batch failure leaves no
partial relational project.

## Validation and Limits

The transfer layer applies these fixed limits:

- 50 MiB maximum compressed ZIP size.
- 100 MiB maximum total expanded content, including `manifest.json`.
- 1,000 maximum ZIP entries.
- 25 MiB maximum per ordinary attachment, matching the existing upload policy.
- 10 MiB maximum per receipt, matching the existing receipt policy.

The importer rejects:

- a missing, duplicate, oversized, or invalid manifest;
- unsupported format identifiers or versions;
- encrypted entries or unsupported compression methods;
- absolute paths, traversal segments, backslashes, control characters,
  directory/symlink entries, duplicate normalized paths, or unexpected root
  paths;
- manifest records with unknown fields, invalid field types, unsupported
  currencies or colors, invalid dates, unsafe amounts, or overlong text;
- missing, duplicate, or dangling archive-local references;
- task/event field combinations that violate current domain rules;
- cross-project, self-referential, duplicate, or cyclic relations that violate
  the current relationship rules;
- undeclared payload entries, declared payloads with no entry, size mismatches,
  checksum mismatches, and files that violate their existing upload policy.

All count and expanded-size limits are checked using declared metadata and
actual decompression output so a forged manifest cannot bypass them.

## User Interface

### Import entry point

The New project modal keeps its existing creation form. Below it, a visually
separated Import project section explains that a Harbor ZIP creates a new copy
with the current user as owner. A secondary `Choose project archive` button is
backed by a hidden file input accepting `.harbor.zip`, `.zip`, and
`application/zip`.

Choosing a file starts the import. While active, the create form and import
control are disabled and the import control reads `Importing…`. On success the
application accepts the returned snapshot, closes the modal, selects the newly
created project, navigates to its project URL, and shows `Project imported`.
On failure it keeps the modal open, clears the file input so the same file can
be retried, and shows the server's safe error message in an error toast.

### Export entry points

Each desktop sidebar project row becomes a composite control: the existing
project-select button remains the primary target and a trailing `⋯` button
opens a small anchored context menu. The menu initially contains `Export
project`. Activating it closes the menu, fetches the archive, triggers the
browser download using the response filename, and shows an error toast if the
server rejects the export.

The project entries in the mobile More sheet expose the same separate overflow
button and Export project action. Exporting does not navigate away from the
current route.

The menu uses `aria-haspopup="menu"`, `aria-expanded`, menu/menuitem roles,
outside-click dismissal, Escape dismissal with focus restoration, and arrow-key
movement between items. Opening one menu closes any other menu. Import and
export controls expose their busy/disabled states and cannot launch duplicate
requests.

## Error Messages

The server maps expected validation failures to concise user-facing errors,
including:

- `Choose a Harbor ZIP archive.`
- `This archive is too large.`
- `This archive is damaged or incomplete.`
- `This archive version is not supported.`
- `An archived file failed its integrity check.`
- `You no longer have access to this project.`
- `Project Harbor could not store the imported files.`

Unexpected internal details, storage keys, SQL errors, stack traces, and actor
identifiers are never returned to the browser.

## Testing

### Domain and archive tests

- Version-1 manifest parsing accepts a complete valid project.
- Unknown keys, unsupported versions, invalid field combinations, invalid
  references, unsafe paths, forged sizes, checksum mismatches, and each archive
  limit are rejected.
- ID remapping gives every imported entity and object a new unique ID while
  preserving internal references.
- Relationship validation preserves directed semantics and canonicalizes
  symmetric relationships.

### Repository and route tests

- Export requires project access and never loads other projects or access data.
- Import requires authentication and assigns only the importer as owner.
- A full round trip preserves collections, tasks, events, relationships,
  payments, attachment bytes, receipt bytes, filenames, content types, pinned
  states, and record timestamps covered by the contract.
- Reimporting an archive creates a second independent project.
- Storage upload and database failures run cleanup and do not expose a partial
  project.
- Export responses use the correct content type, disposition, and cache policy.

### UI and accessibility tests

- The New project modal renders and operates the import action.
- Desktop and mobile project lists render separate Export project actions.
- Overflow controls do not trigger project navigation.
- Context-menu roles, keyboard behavior, focus restoration, and dismissal are
  covered.
- Success and failure paths update busy state, navigation, snapshots, and
  toasts correctly.

The final verification run includes targeted tests, lint, the production build,
and the full existing test suite.

## Out of Scope

- Updating or overwriting an existing project from an archive.
- Restoring memberships, invitations, emails, credentials, or access roles.
- Background transfer jobs, resumable uploads, or archives larger than the
  fixed synchronous limits.
- Importing third-party project-management formats.
- Partial-project export or selective import.
- Preserving original internal database IDs or R2 keys.
