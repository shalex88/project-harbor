# Dashboard Work Item Relation Metadata Design

Date: 2026-07-19

## Summary

Every task and event shown on a dashboard or inside a project's collection view
will include human-readable relationship context alongside its existing
supporting metadata. A linked task will read, for example:

`Q3 Planning · Operating plan · Follow-up for Q3 kickoff`

This change makes causality and dependencies visible while scanning any
work-item list without requiring the user to open each item's Relations tab.

## Scope

- Add relation metadata to every visible task or event in Overview, Tasks,
  Events, Timeline, and Spending.
- Add the same metadata to task and event rows inside project collection views.
- Keep each surface's existing metadata first, such as project and collection,
  due date and status, or occurrence date.
- Show every relationship attached to the item, separated with ` · `.
- Include relation text in the compact Month and Week Timeline cells as a
  secondary line and allow the cell to grow when several relationships exist.
- Include relationship metadata on Spending rows that directly represent a
  task or event. Leave payment-history rows unchanged because those rows
  represent payments rather than work items.
- Do not add relation creation or removal controls to dashboards. Selecting a
  work-item row continues to open the item sheet, where relationships are
  managed.

## Relationship Labels

Labels are derived from the relationship type and the current item's position:

- A `follows_from` target displays `Follow-up for {source title}`.
- A `follows_from` source displays `Followed by {target title}`.
- A `blocks` source displays `Blocks {target title}`.
- A `blocks` target displays `Blocked by {source title}`.
- Either side of `related_to` displays `Related to {other item title}`.

Every matching relationship is displayed. To keep output deterministic,
phrases are ordered by relationship type, linked-item title, and relationship
ID. Missing linked items are ignored defensively rather than showing broken
metadata.

## Components and Data Flow

A small pure helper accepts the current item ID, the workspace's relationship
records, and its work items. It returns the ordered display phrases. A reusable
metadata helper appends those phrases to a surface's existing metadata parts
and joins them with ` · `.

The shared task and event rows used by Overview, Tasks, and Events consume this
helper directly. Timeline Agenda rows, Timeline Month and Week cells, Spending
work-item rows, and project collection task/event rows use the same helper so
labels and ordering cannot drift between views.

All affected views already receive the complete workspace snapshot, so the
feature requires no schema, migration, repository, or API changes.

## Layout and Accessibility

Relation phrases remain inside each row or card's existing supporting-text
region, so visual hierarchy and click targets stay unchanged. Metadata may wrap
when needed instead of truncating relationships. Timeline Month and Week cells
gain a smaller secondary text line inside the existing item button. Existing
past-item muted styling continues to apply to the whole metadata line.

## Testing

Tests will cover:

- each relationship type and both directed perspectives;
- multiple relationships rendered in deterministic order;
- each surface's existing metadata preceding relation phrases;
- items without relationships retaining their current metadata;
- missing linked records being ignored;
- Overview, Tasks, Events, Timeline Agenda, Timeline Month/Week, Spending, and
  project collection rows all using the shared relation metadata;
- payment-history rows remaining unchanged;
- responsive wrapping and past-item styling remaining intact;
- the full production build, automated test suite, and lint checks.
