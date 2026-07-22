# Project Navigation Currency Visibility Design

**Date:** 2026-07-22
**Status:** Approved

## Goal

Show only each project name in the project-navigation rows. Do not show the
project currency beside the name in either the desktop sidebar or the mobile
More panel.

## Scope

This is a presentation-only change in `AppShell`:

- Remove the currency `<small>` element from every desktop project row.
- Remove the currency `<small>` element from every mobile project row.
- Remove the now-unused `.project-nav-item small` style rule.
- Keep the project icon, active state, navigation action, and overflow export
  menu unchanged.

Project currency remains part of the project data model. It continues to appear
where it provides financial or configuration context, including project
details, project settings, item cost and payment forms, and spending summaries.

## Rendering and accessibility

The navigation button's visible text and accessible name both become the
project name alone. No hidden currency label remains in the navigation DOM.
The export menu trigger keeps its existing project-name label, focus behavior,
and portal positioning.

This change does not alter navigation routing, project selection, mobile sheet
behavior, export behavior, or project data flow. It introduces no new error
states.

## Testing

Use a focused source contract test to prove that `AppShell` does not render
`project.currency` in either project-navigation path and that the obsolete CSS
selector is gone. Follow the test-first red-green cycle before editing
production code.

After the focused test passes, run the full lint, build, test, artifact, and Git
whitespace checks. Verify the rendered result in a real browser at desktop and
mobile widths:

- Every project row shows the project name without a currency code.
- Project rows still navigate correctly and retain active styling.
- Each overflow menu still opens above surrounding content without moving the
  project list.

## Acceptance criteria

1. Desktop project-navigation rows show no currency code.
2. Mobile More-panel project rows show no currency code.
3. Currency remains unchanged everywhere outside project navigation.
4. Project navigation and export-menu interactions continue to work.
5. Focused and full verification pass without regressions.
