# Consistent Task Status Indicators Design

## Goal

Use one explicit task-status presentation everywhere a task appears in a dashboard. Remove checkbox-style status indicators and show the same `To do` or `Done` label in Timeline views.

## Scope

The change covers task rows in the global Overview and Tasks dashboards, project collection task lists, Timeline Agenda/Month/Week views, and task entries that appear in the Spending dashboard. The task editor keeps its status select because it is an editing control rather than a dashboard indicator. Event presentations are unchanged.

## Component design

Add a shared `TaskStatusChip` component that accepts a two-state task status and renders the canonical label and status-specific class. All dashboard task surfaces use this component instead of constructing status markup or labels locally.

The component has one visual language in every context:

- `todo` renders `To do`.
- `done` renders `Done`.
- Existing `status-chip`, `status-todo`, and `status-done` styles remain the basis for its appearance.
- A compact modifier may adjust spacing in constrained calendar cells, but it must not change the wording or replace the label with an icon.

## Dashboard behavior

### Overview and Tasks

Remove the leading checkbox square from shared task rows. Keep one trailing `TaskStatusChip` before the row arrow. Adjust the row grid so titles retain the reclaimed space.

### Project collections

Replace the leading checkbox with a single `TaskStatusChip`. Remove the status text from the metadata line so the status is not repeated. Due-date and relation metadata remain unchanged.

### Timeline

Agenda task entries show `TaskStatusChip` in the leading type/status position. Event entries continue to show `Event`.

Month and Week task entries replace the generic checkmark with a compact `TaskStatusChip`. Event entries keep their existing event icon. Both task states remain readable without relying on color alone.

### Spending

When an over-estimate entry is a task, show `TaskStatusChip` once alongside its amount. Event entries receive no task-status indicator.

## Accessibility and responsive behavior

The visible text is the status name, so no icon interpretation is required. Status pills are non-interactive because the containing row opens the item editor. Existing row buttons retain their accessible click target. Calendar layouts may reduce padding and font size but must keep the full `To do` or `Done` text visible.

## Data and error handling

No data model, API, mutation, or migration changes are required. The component accepts the existing `TaskRecord["status"]` union, so unsupported states remain a compile-time and domain-validation concern.

## Testing

Contract tests will verify that:

- dashboard and project-workspace sources no longer render `.task-check` task indicators;
- the shared task-status component owns the canonical labels and status classes;
- Overview, Tasks, project collections, Spending task rows, and every Timeline mode use the shared component;
- Timeline no longer uses a generic checkmark for tasks;
- task metadata in project collections does not repeat the status text.

The focused tests will be run red before implementation, then the full test, lint, build, and artifact-validation suites will run after implementation. The live dashboard will be checked at desktop and narrow widths, with special attention to Timeline calendar cells.
