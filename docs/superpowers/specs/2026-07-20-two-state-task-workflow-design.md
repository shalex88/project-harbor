# Two-State Task Workflow Design

**Date:** 2026-07-20

## Goal

Replace Project Harbor's three-state task workflow with exactly two task statuses: `To do` and `Done`. Existing `In progress` tasks become `To do`, and the Tasks dashboard displays the two statuses in separate side-by-side sections.

## Scope

This change applies to every layer that represents or exposes task status:

- Domain types and validation
- Workspace mutation payloads
- Database schema, migrations, and local bootstrap schema
- Seed/demo data
- Task creation and editing forms
- Overview, Tasks, and Timeline filters and labels
- Task dashboard layout and empty states
- Contract and domain tests

The existing `Open tasks` overview concept remains valid as a grouping of tasks that are not done; with the new model, that means `To do` tasks. `open` and `all` may remain filter modes, but they are not persisted task statuses.

## Data Model and Migration

`TaskStatus` will be the union `"todo" | "done"`. `validateTaskStatus` will accept only those two values and reject `"in_progress"`.

The database migration will first update every task row whose status is `in_progress` to `todo`. It will then replace the work-items status constraint so persisted task status can only be `todo` or `done` (or `NULL` for events under the existing type-field constraint). The runtime bootstrap schema and Drizzle schema will receive the same constraint.

Seed/demo records currently marked `in_progress` will be changed to `todo`. No compatibility alias will remain in the domain or API: clients that submit `in_progress` after the migration receive the existing invalid-status validation error.

## Tasks Dashboard

Project, collection, due-date preset, and due-date range filters continue to produce one filtered task set. The dashboard then partitions that set by persisted status:

- `To do` panel on the left
- `Done` panel on the right

Each panel shows its own count, matching task rows, and a status-specific empty state. The existing two-column panel layout used by the Events dashboard will be reused so the panels collapse according to established responsive behavior.

The status filter is removed from the Tasks dashboard because the page already exposes both statuses as sections. The Clear action resets the remaining filters. Existing `status` query parameters become irrelevant on this page and do not hide either section.

## Other User Interfaces

Task creation, task editing, and follow-up task forms expose only `To do` and `Done`.

Overview and Timeline status filters remove the `In progress` option. Their aggregate filter modes remain:

- Overview: `Open tasks` (equivalent to `To do`) and `To do`
- Timeline: `All statuses`, `To do`, and `Done`

Task rows continue to render a status chip, but status-label logic and CSS contain no `In progress` branch or class.

## Error Handling and Compatibility

The migration is deterministic and lossless with respect to task identity and content: only `in_progress` is mapped to `todo`. Existing tasks already in `todo` or `done` are unchanged.

Legacy API requests containing `in_progress` fail through the normal `DomainError("invalid task status")` path. No new error surface is introduced.

## Testing and Verification

Automated tests will prove that:

- Domain validation accepts `todo` and `done` and rejects `in_progress`.
- Source and schema contracts contain no persisted `in_progress` status option.
- The migration maps legacy values to `todo` before enforcing the two-state constraint.
- The Tasks dashboard renders `To do` and `Done` panels and no status filter.
- Task forms and global filters do not offer `In progress`.
- Existing build, lint, and full test suites continue to pass.

Runtime verification will inspect the Tasks page at desktop width to confirm the two panels are side by side, counts and rows are partitioned correctly, and `In progress` is absent from visible task controls.
