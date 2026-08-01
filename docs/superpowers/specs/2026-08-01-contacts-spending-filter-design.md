# Contacts Spending-Style Filter Design

## Goal

Make the project filter in the Contacts workspace look and behave visually like the project filter in Spending, while preserving the existing Contacts filtering behavior.

## Considered Approaches

1. **Reuse Spending's filter markup and shared CSS classes.** Render the Contacts selector with `filter-bar` and `filter-control`, including the same screen-reader-only label pattern. This is the selected approach because it produces the closest match without introducing a new abstraction.
2. **Extract a shared filter component.** Move `FilterSelect` out of the dashboard module and use it in both workspaces. This would add a cross-module refactor for one small presentation change.
3. **Keep bespoke Contacts classes and copy Spending's styles.** This avoids markup changes but duplicates shared styles and risks the two controls drifting apart.

## Design

`ContactsWorkspace` will render its project selector using the same DOM and CSS class pattern as Spending:

- The filter container uses `filter-bar`.
- The label uses `filter-control`.
- The text label becomes screen-reader-only.
- The Contacts region also uses `dashboard-stack` so the filter-to-content spacing matches Spending.
- The select retains `aria-label="Filter contacts by project"`.
- The option list, controlled value, filtering, empty state, creation default, and navigation-reset behavior remain unchanged.

The Contacts-only filter classes will be removed because the shared Spending classes replace them. Existing responsive rules for `dashboard-stack`, `filter-bar`, and `filter-control` will apply on mobile.

## Verification

- Add a rendered regression assertion that Contacts uses the Spending filter structure.
- Confirm the focused Contacts UI tests fail before the markup change and pass afterward.
- Run the complete test suite, production build, lint, and diff checks.
- Inspect Contacts in a browser at desktop and mobile widths and compare the control with Spending.

## Non-Goals

- No changes to filtering state or URL persistence.
- No changes to project options or contact data.
- No refactor of the Spending dashboard components.
