# Work Item Relations Design

Date: 2026-07-19

## Summary

Project Harbor will keep tasks and events as distinct work-item variants. An
event remains a dated, non-actionable record; a task remains actionable work
with workflow status. Items cannot be converted between types.

The feature adds explicit same-project relationships and a focused event action
for creating a linked follow-up task. This preserves the event as historical
context while recording the task that resulted from it.

## Product Decisions

- Tasks and events remain separate variants in the existing `work_items` table.
- The application does not expose task/event conversion, including as an error
  correction workflow.
- Relationships are limited to items in the same project.
- The initial fixed relationship types are `follows_from`, `blocks`, and
  `related_to`.
- Creating a follow-up task from an event defaults to the event's collection but
  does not copy its title, description, date, cost, files, or payments.
- Relationship removal never removes either connected item.

## Relationship Model

A new `work_item_relations` table stores:

- generated relationship ID;
- project ID;
- source item ID;
- target item ID;
- relationship type;
- creator ID and creation timestamp.

Both item references cascade on item deletion. A composite foreign-key strategy
ensures both items belong to the stored project. The table rejects self-links
and duplicate relationships.

Relationship semantics are:

- `follows_from`: directed from the predecessor to the follow-up. The
  predecessor displays the target under **Follow-up items**; the target displays
  the source under **Follows from**.
- `blocks`: directed from the blocking task to the blocked task. Only tasks can
  participate. Each side displays **Blocks** or **Blocked by**.
- `related_to`: symmetric between any two work items. IDs are stored in a
  canonical order so the same pair cannot be added twice in reverse order.

Directed `follows_from` and `blocks` graphs reject cycles, including transitive
cycles. All relationship operations require access to the shared project.

## Mutations and Data Flow

The workspace mutation API gains operations to add and remove relationships.
The server loads both items, verifies project access and same-project ownership,
normalizes symmetric links, enforces type and graph invariants, then persists
the relationship.

The API also gains `create_follow_up_task`. It accepts the source event ID and
the normal new-task fields. The server verifies that the source is an event,
creates the task in the selected collection within the same project, and creates
the `follows_from` relationship in one D1 batch. The operation either creates
both records or neither record.

Workspace snapshots include normalized relationship records. The client derives
the label and direction appropriate to the item currently open.

## Interaction Design

Existing item sheets gain a **Relations** tab alongside Details, Files, and
Payments. It groups links by their user-facing direction, shows each linked
item's type, title, collection, date or status, and opens that item when
selected. Each relationship can be removed without deleting either item.

The Relations tab also contains an **Add relationship** form. The user selects
one of the supported relationship meanings and a searchable item from the same
project. The picker excludes the current item, invalid item types, and already
linked items.

Existing events expose a prominent **Create follow-up task** action. It opens
the normal task form with:

- the same project fixed;
- the source event's collection selected by default, while allowing another
  collection in the same project;
- an explicit “Follows from [event title]” context line;
- blank task title, description, due date, and estimated cost;
- initial status `todo`.

Submitting the form keeps the new task sheet open after the snapshot refresh so
the user can add files or payments immediately. Standard task creation remains
unchanged.

## Error Handling

- Missing or inaccessible items return the existing not-found or forbidden
  domain errors.
- Cross-project, self, duplicate, invalid-type, and cyclic links return clear
  validation or conflict errors without changing data.
- If the source event or target collection disappears while the follow-up form
  is open, task creation fails without leaving an unlinked task.
- Removing a relationship that was already removed is treated as not found and
  refreshes no client state.
- Client forms surface server errors in the existing inline error region and
  retain entered values for correction.

## Migration and Compatibility

The migration only adds the relationship table and its indexes. Existing work
items, files, payments, dashboards, and timeline projections are unchanged.
Snapshots with no relationships serialize an empty array, so existing projects
need no backfill.

## Testing

Tests will cover:

- mutation parsing and rejection of unknown relationship fields;
- same-project, self-link, duplicate, type, canonical-order, and cycle rules;
- atomic follow-up task creation and source-event validation;
- relationship snapshot mapping and deletion cascades;
- item-sheet relation grouping, add/remove controls, linked-item navigation, and
  the event follow-up action;
- unchanged task/event type invariants and existing dashboard behavior;
- full automated test, lint, and production-build verification.

