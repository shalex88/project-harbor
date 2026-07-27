# Timeline and Spending header actions design

## Goal

Remove project creation from the Spending header and add task creation to the
Timeline header without changing the actions on other routes.

## Approach

Keep route-specific action selection in `HarborApp` and shared header rendering
in `AppShell`. Make the existing primary action optional and add one optional
secondary action. Timeline supplies `New task` as the secondary action and
retains `New event` as the primary action. Spending supplies no actions.

The desktop header renders the secondary action immediately before the primary
action and gives both actions the same primary-button styling. The mobile header
continues to expose only the primary action; it is hidden when a route has no
primary action. Therefore Timeline's existing mobile create behavior remains
event creation, while Spending no longer shows a mobile create button.

## Scope

- Remove `+ New project` from the Spending workspace header.
- Remove the generic mobile create action from Spending.
- Add `+ New task` immediately left of `+ New event` on Timeline.
- Give both Timeline actions the same primary-button design.
- Open the existing new-task form from the new Timeline action.
- Preserve every other route's header actions and creation behavior.
- Do not add a new modal, mutation, or dashboard-local header.

## Testing

Add a source-level contract test for the shared shell and route composition:

- `AppShell` accepts optional primary and secondary actions;
- the desktop header renders the secondary action before the primary action;
- the mobile create control depends on the primary action;
- Timeline supplies task and event actions in the approved order; and
- Spending supplies no header action.

Run the focused contract test red before implementation. After implementation,
run the focused test, complete build/test suite, lint, artifact validation, and
inspect Timeline and Spending in the browser.
