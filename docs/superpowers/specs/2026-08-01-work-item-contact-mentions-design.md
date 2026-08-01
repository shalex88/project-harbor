# Work item contact mentions design

## Goal

Let a project member associate zero or more project contacts with a task or
event, either manually or by mentioning them in the title or description.
Typing a role or name after `@` finds contacts from the item project, selecting
a result inserts an inline contact mention, and activating a saved mention
offers quick call, email, and contact-detail actions.

The complete interaction must support English, Hebrew, and mixed-direction
content on desktop and mobile.

## Product behavior

### Linking contacts

Every task and event has a deduplicated contacts list. The list may be empty.
A contact can enter the list in either of two ways:

- selecting the contact from a Contacts control in the item Details form; or
- selecting the contact from the mention picker after typing `@` in the title
  or description.

Manual links and mention-created links have distinct lifetimes. Selecting an
inline mention automatically links that contact. Removing the last mention of
a contact removes the link when mentions were its only source. A manually
linked contact remains linked after its last mention is removed. If a contact
is both manually linked and mentioned, removing its mentions preserves the
manual link.

Removing a contact through the Contacts control removes its manual link and
all mention metadata for that contact. Existing `@Name` text stays in the title
or description as ordinary, noninteractive text. Mentioning the contact again
re-creates the automatic link.

The same contact may appear more than once in the text but appears only once
in the contacts list. Items can link only to contacts belonging to their own
project.

### Mention editing

The title and description use a shared mention-aware editor, configured as a
single-line title editor or multiline description editor. Its external value
is plain text plus structured mention ranges; consumers do not depend on its
DOM implementation.

An `@` trigger is recognized at the start of the field or after whitespace or
punctuation. It is not triggered by the `@` inside an email address. The query
may contain Unicode letters, numbers, spaces, and hyphens, allowing roles such
as `@עורך דין` as well as `@lawyer`. Escape closes the picker and leaves the
typed text unchanged.

The picker searches only the current project's contacts. It matches normalized
contact names and role/company values. Exact and prefix role matches rank
first, followed by exact and prefix name matches and then substring matches.
Ties use the directory's stable name-then-ID order. Results show both the
contact name and role/company so a role query can identify the person being
selected.

Selecting a result replaces the active query with an indivisible `@Name`
mention associated with the contact ID. The picker supports pointer selection,
Arrow Up, Arrow Down, Enter, and Escape, and follows the accessible combobox
pattern. Backspace or Delete at a mention boundary removes the whole mention;
editing within a mention first converts it to ordinary text so metadata cannot
silently point at the wrong characters. Pasted content is plain text and does
not create links.

The Contacts control in the Details form supports adding and removing contacts
without typing mentions. It lists linked contacts as compact name and
role/company chips. It uses the same project-scoped matching rules as the
mention picker.

### Saved presentation and quick actions

Saved title mentions are interactive anywhere a work-item title appears,
including Overview, Tasks, Events, Timeline, Spending, and project collection
views. Activating a mention stops the enclosing work-item row action and opens
a small contact action popover. Description mentions are interactive in the
open item Details view. Manually linked contact chips use the same popover.

The popover contains only actions supported by the current contact record:

- **Call** uses a `tel:` link when a phone number exists;
- **Email** uses a `mailto:` link when an email address exists; and
- **View contact** opens a read-only contact detail view containing the current
  name, role/company, email, phone, and notes.

Phone numbers and email addresses are not copied into work-item data. Every
interaction resolves the contact ID against the current workspace snapshot, so
contact-detail edits take effect everywhere immediately.

## Hebrew and bidirectional behavior

Mention query matching uses Unicode normalization and works for Hebrew and
English names and roles. Editors use automatic base-direction detection. Each
mention, result label, email address, phone number, and mixed-language fragment
is bidirectionally isolated so its internal order cannot reorder surrounding
punctuation or text.

The design must preserve correct caret movement and picker anchoring in RTL,
LTR, and mixed-direction fields. Mention range offsets use JavaScript UTF-16
string indices consistently in the editor, mutation validator, renderer, and
tests. Rendering uses semantic `bdi` or equivalent isolation rather than
assuming the page direction.

Examples that must remain legible and editable include:

- `התקשרי אל @דנה כהן`;
- `Call @דנה כהן regarding the contract`;
- `להתקשר אל @Dana Cohen לגבי החוזה`; and
- contact details that mix a Hebrew name with a Latin email address or phone
  number.

## Domain and persistence model

### Item-contact links

Add `work_item_contacts` with:

- `project_id`;
- `item_id`;
- `contact_id`; and
- `manually_linked`, stored as a required boolean integer.

The `(item_id, contact_id)` pair is the primary key. Composite foreign keys bind
the item and contact to the same `project_id`, with cascading deletion. Add the
required unique key on `(id, project_id)` to project contacts and an index for
contact-to-item lookup.

The stored set is the union of manually selected contacts and contacts used by
mention occurrences. `manually_linked` is true only when the user explicitly
selected the contact through the Contacts control.

### Mention occurrences

Add `work_item_contact_mentions` with:

- a generated mention ID;
- `item_id` and `contact_id`, referencing an existing item-contact link;
- `field`, restricted to `title` or `description`;
- `start_offset`; and
- `end_offset`.

Offsets are zero-based, end-exclusive UTF-16 positions into the persisted
field. Checks require nonnegative offsets with `end_offset > start_offset`.
The repository additionally enforces field bounds, non-overlap, stable order,
and an exact `@Name` slice for the selected contact. Multiple occurrences may
reference the same link.

Deleting a work item cascades through links and mentions. Deleting a contact
cascades its links and mentions while leaving the plain fallback text already
stored in the work item.

### Domain snapshot

Each `WorkItemRecord` gains arrays that are always present, including on legacy
items:

- `contactLinks`, containing `contactId` and `manuallyLinked`; and
- `contactMentions`, containing the occurrence ID, contact ID, field, and
  offsets.

The workspace's existing top-level contacts collection remains the source of
contact details. A work item does not embed a second copy of a contact.

The renderer uses the current contact name for a valid mention. When opening
the editor, mention labels are normalized to current names and offsets are
recomputed before further edits. The persisted text therefore remains a useful
fallback if the contact or mention metadata is later removed.

## Mutation and repository flow

The task and event variants of `create_item` and `update_item`, plus
`create_follow_up_task`, accept two optional structured inputs:

- `manualContactIds`, defaulting to an empty array; and
- `contactMentions`, defaulting to an empty array and containing contact ID,
  field, start offset, and end offset.

Keeping these inputs optional preserves compatibility with existing internal
callers while strict parsing continues to reject unknown fields. The server
deduplicates manual contact IDs and derives the full contact-link set as the
union of manual IDs and mentioned IDs.

For create and follow-up operations, the repository resolves the destination
collection and project before validating contacts. For updates, it resolves the
stored item project. Validation then requires every contact to exist in that
project and every mention range to describe the submitted title or description
exactly. Contact lookup and authorization must not reveal contacts from an
inaccessible project.

The work-item write, replacement contact-link set, and replacement mention set
execute in one D1 batch. Updates preserve no hidden stale links: the submitted
manual IDs and mention occurrences are the complete desired state. A successful
mutation returns the normal refreshed workspace snapshot.

The item sheet keeps its current local-error and shared-toast behavior. A
validation, authorization, or conflict response leaves the editor open with
its unsaved value. If a referenced contact was deleted or renamed concurrently,
the save fails rather than linking an incorrect range; refreshing or selecting
the current contact resolves the conflict.

## Component boundaries

Implementation is split into focused units:

- Mention value helpers own query detection, Unicode-normalized search/ranking,
  insertion, deletion, range shifts, manual-link reconciliation, and
  serialization. They have no React or persistence dependency.
- `MentionTextEditor` owns editable DOM behavior, caret coordinates,
  composition/input events, and the accessible picker. It consumes project
  contacts and emits the structured value.
- `ContactSelector` owns manual contact matching and chip management. It emits
  only the explicit manual-contact ID set.
- `MentionText` renders plain text and interactive mention buttons from ranges.
  Existing shared work-item title rendering consumes it so dashboards do not
  implement their own parsing.
- `ContactActionPopover` and the read-only contact detail view own Call, Email,
  and View contact behavior and are shared by inline mentions and contact
  chips.
- Mutation parsing, repository persistence, snapshot assembly, and archive
  transfer remain server-side boundaries following existing project access
  patterns.

No component infers identity by matching a displayed name. Contact ID is the
identity at every boundary.

## Project archive compatibility

Version-1 project archives gain optional contact-link and mention collections.
Exports include both in stable item/field/offset order. Imports remap project,
item, and contact IDs, validate every reference and range, and persist the new
records in the same project-import batch.

The parser accepts archives created before this feature by treating omitted
link and mention collections as empty. It rejects unknown fields, duplicate
links, overlapping occurrences, missing item/contact references, cross-project
references, and malformed offsets.

## Error and empty states

- A picker with no results displays `No matching contacts`; it does not offer
  contact creation.
- A contact without a phone or email omits the corresponding quick action.
- A contact with neither still offers View contact.
- A missing contact encountered during save returns the existing not-found or
  validation response without partially modifying the item.
- A deleted contact removes structured links through database cascades; its
  stored text remains ordinary text.
- Existing plain `@` text is never treated as a link unless it has valid mention
  metadata.

## Testing and verification

Focused automated tests cover:

- schema checks, same-project foreign keys, cascade behavior, link
  deduplication, and legacy empty arrays;
- strict parsing and defaults for create, update, and follow-up mutations;
- repository authorization, atomic replacement, manual-versus-mentioned
  lifetime rules, multiple occurrences, stale contacts, and invalid or
  overlapping ranges;
- archive backward compatibility, validation, export ordering, ID remapping,
  and import persistence;
- query triggers that exclude email addresses;
- Hebrew and English role/name normalization, matching, and stable ranking;
- pure mention insertion, deletion, conversion to plain text, range shifting,
  current-name normalization, and manual-link reconciliation;
- title and description editing during creation and update;
- accessible pointer and keyboard picker behavior;
- interactive mentions in every dashboard title surface and item details;
- Call, Email, View contact, missing-detail behavior, and event propagation; and
- automatic, RTL, LTR, and mixed-direction markup contracts.

After focused tests pass, run the complete test suite, lint, and production
build. Browser verification covers populated and empty contact states, manual
and mention linking, multiple contacts, removal behavior, quick actions, and
contact detail edits at desktop and mobile widths. Repeat the editor and
rendering checks with Hebrew-only, English-only, and mixed-direction examples,
including punctuation, email addresses, and phone numbers.

## Out of scope

This feature does not create contacts from the picker, link contacts across
projects, send email or messages within Project Harbor, initiate notifications
or reminders, assign responsibility, or add general-purpose rich-text
formatting. Call and email actions delegate to the device through `tel:` and
`mailto:` links.
