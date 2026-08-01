# Project contacts design

## Goal

Add an external contact directory to Project Harbor. Contacts belong to a
single project, remain separate from project members and invitations, appear
both inside their project and in an aggregate workspace, and travel with the
project when it is exported and imported.

## Contact model and permissions

Each contact is a first-class `project_contacts` record with:

- a required name;
- optional role or company, email address, phone number, and notes;
- the owning project ID; and
- creation and update timestamps.

A contact belongs to exactly one project. The same real-world person may be
entered separately in more than one project; the first version does not merge,
deduplicate, link, or move contacts between projects. Deleting a project
cascade-deletes its contacts.

Every member of a project may create, edit, and delete its contacts. The server
authorizes each operation through the existing project-membership boundary.
Contacts do not grant project access and are never treated as members or
invitations.

Name is trimmed, required, and limited to 160 characters. Role or company is a
single free-text field limited to 160 characters. Email is limited to 254
characters, phone to 80 characters, and notes to 2,000 characters. All four
optional values are trimmed and stored as empty strings when omitted. Email
input uses the browser's email control for immediate feedback, while the server
remains authoritative for accepted field types, allowed fields, required text,
and maximum lengths.

## Workspace and project interfaces

Add Contacts as a top-level route after Spending in desktop navigation and in
the mobile More menu. The Contacts workspace lists all contacts from projects
the signed-in member can access, ordered case-insensitively by contact name and
then ID.
Each responsive contact card shows its project, name, role or company, email,
phone, and notes. Present email and phone as `mailto:` and `tel:` links when
present. No search, filters, or user-selectable sorting are included.

The workspace header exposes `+ New contact`. Its modal contains a project
selector followed by the contact fields. Edit keeps the contact's project
fixed. Each card exposes Edit and Delete actions; deletion requires a compact
confirmation before the mutation is sent.

Each project page gains a Contacts section after the collection work area and
before Access/Members. It lists only that project's contacts with the same card
presentation and edit/delete actions, plus a `+ New contact` button whose form
is already scoped to the project. Both surfaces use clear empty states and the
existing modal, field, action, pending, toast, and responsive layout patterns.

## Data flow and mutations

The workspace snapshot gains a contacts collection containing only records
whose projects the current user may access. The existing snapshot request and
client mutation loop remain the single data flow for both contact surfaces.

Add strict `create_contact`, `update_contact`, and `delete_contact` workspace
mutations. Create accepts a project ID and contact fields. Update accepts a
contact ID and fields but no project ID, preventing moves between projects.
Delete accepts only a contact ID. Mutation parsing rejects unknown fields,
normalizes values, and delegates authorization and persistence to repository
operations. Successful operations return a refreshed workspace snapshot and
use the shared toast region; failed operations leave the current snapshot and
open editor state intact.

The database schema, development preview schema, Drizzle migration, domain
types, repository snapshot query, and development seed all learn about project
contacts. Seed contacts provide realistic content for both the aggregate and
project interfaces without changing production data.

## Project archive compatibility

The version-1 archive manifest gains a validated `contacts` array. Exports
always include it, ordered stably and containing contact IDs, fields, and
timestamps. Imports generate new contact IDs, bind every imported contact to
the newly created project, preserve its content and timestamps, and persist it
in the same D1 batch as the rest of the project.

To preserve compatibility with archives produced before this feature, the
version-1 parser accepts an omitted `contacts` property as an empty array. It
still rejects unknown contact fields, duplicate contact IDs, invalid values,
and malformed timestamps. No contact data is written to R2.

## Error handling

Missing projects or contacts return the existing not-found domain response.
Attempts to operate on contacts outside the user's accessible projects return
the existing authorization response without revealing their data. Invalid or
unknown input fields return validation responses. A failed mutation or import
does not partially update client state; import continues to rely on the
existing batch persistence and uploaded-object cleanup behavior.

Concurrent edits use last-write-wins behavior, consistent with other workspace
records. Deleting an already-removed contact returns not found rather than
silently succeeding.

## Testing and verification

Tests cover:

- the schema, migration, cascade, preview schema, and snapshot contract;
- strict parsing and normalization of all three contact mutations;
- repository CRUD authorization for owners, members, and non-members;
- aggregate snapshot scoping and stable ordering;
- desktop and mobile Contacts navigation and route behavior;
- workspace and project contact cards, empty states, modal fields, clickable
  email and phone values, and edit/delete interactions;
- archive validation, backward-compatible missing contacts, export inclusion,
  ID remapping, and import persistence; and
- project deletion cascading to contact records.

Implementation follows test-driven development: add focused failing tests for
each boundary before the corresponding production changes. After focused tests
pass, run the complete test suite, lint, and production build. Inspect the
Contacts workspace and project Contacts section in the browser at desktop and
mobile widths, including populated, empty, create/edit, and delete-confirmation
states.
