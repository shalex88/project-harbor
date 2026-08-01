# Generic Follow-up Items Design

## Goal

Allow any existing task or event to create a linked follow-up that is itself
either a task or an event. Task and event sources use the same interaction and
the same persistence guarantees.

## User Experience

The Details tab for every existing task and event shows **Create follow-up**
beside the delete action. Activating it opens an accessible menu with two
choices, **Task** and **Event**.

Choosing a type replaces the details sheet with a follow-up creation form for
that type. The form:

- is titled **New follow-up task** or **New follow-up event**;
- shows **Follows from _source title_**;
- defaults to the source item's collection;
- permits any other collection in the same project;
- uses the existing task fields (status, optional due date) or event fields
  (required occurrence date), as appropriate;
- retains the existing title and description contact-mention controls,
  manually linked contacts, and optional estimated cost.

The menu uses button/menu semantics and exposes its expanded state. Opening it
focuses the first choice; Arrow Up/Down, Home/End, Enter/Space, and Escape use
standard menu behavior. An outside click dismisses it, and dismissal without a
selection restores focus to the trigger. Selecting an item opens the new sheet
form.

After a successful save, the sheet opens the newly created item, matching the
current event-to-task follow-up behavior. Cancel closes the sheet. Starting a
follow-up continues to replace the current sheet, so unsaved edits to the source
item are not submitted.

## Client Architecture

Generalize `ItemSheetMode` from an event-specific follow-up to:

```ts
{
  kind: "follow-up";
  sourceItemId: string;
  type: "task" | "event";
  collectionId: string;
}
```

`ItemSheetContent` resolves any task or event as the source item. The selected
destination type drives the existing type-specific fields and submit logic.
The source item's project supplies the collection choices and project-scoped
contacts.

The follow-up chooser is a small, focused client component used by both source
types. It owns only menu state, focus, dismissal, and the destination-type
callback. Item-sheet state remains owned by `HarborApp`.

## Mutation Contract

Replace the specialized internal `create_follow_up_task` mutation with a
discriminated `create_follow_up_item` mutation. Both variants include
`sourceItemId`, `collectionId`, shared item/contact fields, and a destination
`type`.

The task variant accepts `status` and `dueDate`. The event variant accepts
`occurrenceDate`. The parser rejects fields belonging to the other item type,
just as ordinary item creation does.

This is an internal application mutation with no supported external clients, so
the old event-specific mutation does not remain as a compatibility alias. All
application call sites and contract tests move to the generic action together.

## Persistence and Authorization

The repository authorizes the source item and target collection independently,
then verifies that both belong to the same project. It does not restrict the
source or destination item type.

One D1 batch atomically:

1. inserts the selected task or event with its ordinary validated fields;
2. inserts a `follows_from` relation from the source item to the new item;
3. inserts validated contact links and mention occurrences for the new item.

The response continues to return `createdItemId`, allowing the client to open
the new item. The relation schema is already generic, so this feature needs no
database migration.

## Error Handling

- If the source item disappears while its form is open, the sheet shows a
  source-item-unavailable empty state.
- If the selected collection disappears or belongs to another project, the
  repository rejects the mutation without creating either the item or relation.
- Existing task/event field validation and contact validation errors are
  surfaced through the sheet's inline error and application toast behavior.
- Because creation and relation insertion share one batch, no unlinked partial
  follow-up can remain after a failure.

## Testing

Implementation follows red-green-refactor. Tests will establish that:

- task and event details both expose **Create follow-up**;
- the chooser offers task and event destinations and dispatches the selected
  type;
- follow-up sheet state retains the source item, destination type, and default
  collection;
- task and event follow-up submissions serialize their correct type-specific
  fields and shared contact state;
- mutation parsing accepts both variants, rejects crossed type-specific fields,
  and rejects unsupported keys;
- repository handling authorizes the source and collection, permits both source
  types, creates both destination types, uses `follows_from`, batches all
  writes, and returns the new item ID;
- the build, lint suite, targeted tests, and full test suite remain green.

## Scope

This change does not alter relationship labels, copy source field values into
the new item, add a schema migration, or change ordinary task/event creation.
The new follow-up starts with blank content apart from existing field defaults
and the source collection selection.
