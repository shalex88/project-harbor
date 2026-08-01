# Contacts project filter design

## Goal

Let members narrow the aggregate Contacts workspace to one accessible project
without adding search, sorting, grouping, or a new server request. The current
combined directory remains the default view.

## Workspace interaction

Add one project selector above the contact cards. Its first option is
`All projects`, followed by every project in the existing workspace snapshot in
the same order used elsewhere in the application. The selector defaults to
`All projects` whenever the Contacts workspace mounts.

Selecting a project immediately filters the existing snapshot contacts by
`projectId`. Contact cards keep their project badge in both the combined and
filtered views so their context remains explicit. The selection is local UI
state: it is not added to the URL, persisted between visits, or sent to the
server.

When a selected project has no contacts, show a project-specific empty state:
`No contacts in this project`. The unfiltered empty state remains
`No contacts yet` with its existing workspace description.

The workspace header continues to expose `+ New contact`. When one project is
selected, opening that form preselects the filtered project while keeping the
project selector editable. From `All projects`, creation retains the existing
default-project behavior.

## Component and data flow

`HarborApp` owns the selected project ID so the existing workspace-header action
can use the same selection. It resets the filter to `All projects` when the
member enters the Contacts route and also if the selected project disappears
after a refreshed snapshot.

`ContactsWorkspace` receives the selection and change callback, derives its
visible contacts from `snapshot.contacts`, renders the selector using the
existing filter control styling, and passes the derived contacts to
`ContactGrid`. `HarborApp` uses a specific selection only as the create
dialog's initial project; edit remains project-fixed and no mutation shape
changes.

No database, domain, repository, mutation, archive, or API changes are needed.

## Responsive and accessible behavior

The selector uses a visible `Project` label and the existing minimum control
height. It spans the available width on small screens and stays compact on
desktop. Keyboard and assistive-technology behavior comes from the native
`select` element. Filtering does not move focus or announce unrelated status
messages.

## Testing and verification

Tests cover:

- `All projects` as the default option;
- filtering contacts by the selected project;
- the project-specific empty state;
- resetting to `All projects` if the selected project is removed;
- preselecting the filtered project in the new-contact dialog;
- preserving an editable project selector during global creation; and
- responsive filter styling without changing the card grid behavior.

Implementation follows test-driven development. After focused tests pass, run
the complete test suite, lint, and production build, then exercise the default,
filtered, empty, create, and mobile states in a real browser. Update the
existing Contacts pull request with the verified commits.
