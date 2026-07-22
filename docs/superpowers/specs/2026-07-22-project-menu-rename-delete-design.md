# Project Menu Rename and Delete Design

**Date:** 2026-07-22
**Status:** Approved for implementation

## Goal

Add rename and delete actions to each project's `•••` context menu while
preserving the existing export behavior, authorization rules, keyboard
interaction, and desktop/mobile presentation.

## Product Decisions

- Project owners see `Rename project`, `Export project`, and `Delete project`.
- Project members continue to see only `Export project`.
- Rename and delete use the existing `update_project` and `delete_project`
  workspace mutations. No new API actions or schema changes are required.
- Rename changes only the project name and preserves its description and fixed
  currency.
- Delete always requires an explicit confirmation and uses destructive styling.
- A failed mutation leaves its dialog open and reports the existing error toast.
- Deleting a project that is not currently open leaves the current route
  unchanged.
- Deleting the active project navigates to Overview and replaces the stale
  project URL with `/`.

## Component Design

### ProjectMenu

`ProjectMenu` receives the project's role through the existing `ProjectRecord`
and two callbacks: `onRename` and `onDelete`. It renders those items only when
`project.role === "owner"`. Selecting an item closes the floating menu before
calling the matching callback. `Delete project` receives a dedicated danger
class, while all menu items retain the current menu-item role, focus behavior,
arrow-key navigation, Escape handling, and fixed portal positioning.

### AppShell

`AppShell` owns one project-action dialog state shared by all desktop and mobile
menu instances. A menu action records the selected project, closes the mobile
More sheet when it is open, and opens either:

- a small rename modal containing a required, 120-character project-name input;
  or
- a small delete confirmation modal naming the selected project and explaining
  that deletion cannot be undone.

The rename form submits the selected project ID and new name. The delete button
submits the selected project ID. The dialog closes only after its callback
resolves. Existing modal focus management and form controls are reused.

### HarborApp

`HarborApp` supplies asynchronous rename and delete callbacks to `AppShell`.
Rename sends `update_project` with the new name and the selected project's
unchanged description. Delete sends `delete_project`. Both operations flow
through the existing `mutate` helper so snapshots, validation errors, pending
state, and success/error toasts stay consistent.

After a successful delete, `HarborApp` checks whether the deleted project was
the active project. If it was, the app switches to Overview and calls
`history.replaceState` with `/`. Otherwise it retains the current route and URL.

## Data and Error Flow

1. The owner selects Rename or Delete from a desktop or mobile project menu.
2. `ProjectMenu` closes and asks `AppShell` to open the selected dialog.
3. `AppShell` invokes the matching `HarborApp` callback on confirmation.
4. `HarborApp.mutate` posts the existing mutation and accepts the returned
   workspace snapshot.
5. On success, project labels update from the snapshot and the dialog closes.
6. On failure, the existing toast reports the error, the callback rejects, and
   the dialog stays open for retry or cancellation.

## Testing

- Verify owner menus expose rename and delete while member menus do not.
- Verify rename and delete menu items call their callbacks and preserve existing
  export and keyboard contracts.
- Verify the shell contains shared rename and delete dialogs, preserves the
  project description in rename payloads, and applies destructive styling.
- Verify delete routing distinguishes active and non-active projects and uses
  URL replacement for the active-project case.
- Run the complete test suite, linter, and production build.

## Out of Scope

- Editing project description or currency from the context-menu rename dialog.
- Changing owner/member authorization.
- Adding restore, archive, or soft-delete behavior.
- Refactoring the Project Settings screen.
