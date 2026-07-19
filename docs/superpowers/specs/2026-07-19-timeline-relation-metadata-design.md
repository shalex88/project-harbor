# Timeline Relation Metadata Design

Date: 2026-07-19

## Summary

Agenda rows in the Timeline will append human-readable relationship context to
the existing project and collection metadata. A linked task will read, for
example:

`Q3 Planning · Operating plan · Follow-up for Q3 kickoff`

This change makes causality and dependencies visible while scanning the Agenda
without requiring the user to open each item's Relations tab.

## Scope

- Add relation metadata to the Timeline's Agenda view.
- Keep the existing project and collection metadata first.
- Show every relationship attached to the item, separated with ` · `.
- Leave Month and Week calendar cells unchanged so their compact layout remains
  readable.
- Do not add relation creation or removal controls to the Timeline. Selecting an
  Agenda row continues to open the item sheet, where relationships are managed.

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
records, and its work items. It returns the ordered display phrases. The Agenda
row joins the project name, collection name, and returned phrases with ` · `.

The Timeline already receives the complete workspace snapshot, so the feature
requires no schema, migration, repository, or API changes.

## Layout and Accessibility

The metadata remains inside the Agenda row's existing `<small>` element, so its
visual hierarchy and row click target stay unchanged. Metadata may wrap when
needed instead of truncating relationships. Existing past-item muted styling
continues to apply to the whole metadata line.

## Testing

Tests will cover:

- each relationship type and both directed perspectives;
- multiple relationships rendered in deterministic order;
- project and collection metadata preceding relation phrases;
- items without relationships retaining their current metadata;
- missing linked records being ignored;
- Month and Week calendar rendering remaining unchanged;
- the full production build, automated test suite, and lint checks.
