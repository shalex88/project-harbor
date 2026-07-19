# Sidebar Current Date Design

Date: 2026-07-16

## Goal

Show the viewer's current local date directly beneath `Project Harbor` in the desktop sidebar brand using the long English format, for example `Thursday, July 16, 2026`.

## Interaction and Presentation

- The anchor icon remains to the left of a two-line brand text block.
- `Project Harbor` keeps its existing size, weight, and overview-navigation behavior.
- The current date appears beneath the product name in smaller muted text.
- The date is part of the existing brand button and does not introduce a separate control.
- The mobile header remains unchanged because the browser comment targets the desktop sidebar brand.

## Implementation Boundaries

A focused pure helper formats a supplied `Date` with `Intl.DateTimeFormat` using the `en-US` locale and `weekday`, `month`, `day`, and `year` in long/numeric form. `AppShell` computes the current date after client hydration so the displayed calendar day follows the browser's local timezone without creating a server/client hydration mismatch.

The brand markup gains a text wrapper and date element. Focused CSS stacks the name and date vertically while preserving the existing icon alignment, spacing, and clickable area.

## Failure Behavior

The formatter relies only on the browser's built-in internationalization support and requires no network or persistence. Before hydration, the date line is absent; after mount, it renders the current local date.

## Verification

- A pure unit test verifies the exact long English date format using a local-time `Date` fixture.
- A source contract verifies that the desktop brand renders the formatted date while the mobile brand stays unchanged.
- The focused tests, full test suite, lint, and production build must pass.
- The live local preview must visibly show the date beneath `Project Harbor` at desktop width.
