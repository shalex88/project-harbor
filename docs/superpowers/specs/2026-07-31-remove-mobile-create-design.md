# Remove Redundant Mobile Create Action

## Goal

Remove the generic `+ Create` button from Project Harbor's mobile header so
mobile and tablet layouts expose only the existing page-specific `+ New …`
actions.

## Design

`AppShell` will keep the mobile Harbor brand button but will no longer render a
generic creation action in `.mobile-header`. The existing workspace-header
actions remain unchanged:

- Overview keeps `+ New project`.
- Tasks and project views keep `+ New task`.
- Events keeps `+ New event`.
- Timeline keeps `+ New task` followed by `+ New event`.
- Spending remains actionless.

The removal applies on every route because the generic control duplicates the
more descriptive workspace-header actions and does not provide a distinct
capability.

## Testing

Render `AppShell` with a page-specific primary action. Verify that the rendered
mobile header contains the Harbor brand but no `+ Create` button, while the
workspace header still contains the supplied `+ New task` action. This catches
both reintroduction of the redundant control and accidental removal of the
specific action.

## Scope

No creation handlers, route mappings, desktop actions, navigation, data, or
styles change. The work stays in the local checkout and is not pushed,
versioned in Sites, or deployed.
