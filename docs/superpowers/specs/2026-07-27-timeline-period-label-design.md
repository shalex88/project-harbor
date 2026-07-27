# Timeline period label design

## Goal

Show the period currently displayed by the Timeline calendar so users can
identify the visible month or week without inferring it from individual day
cells.

## Approach

Add a small timeline period formatting helper and render its output beside the
existing previous, Today, and next controls. The helper accepts the calendar
anchor and the active calendar mode, keeping formatting separate from the
Timeline component and directly testable.

Month view displays the full month and year, such as `August 2026`. Week view
displays the complete Sunday-through-Saturday range represented by the existing
week grid, such as `August 9–15, 2026`. Cross-month and cross-year ranges retain
the information needed to make both endpoints unambiguous:

- `July 26–August 1, 2026`
- `December 27, 2026–January 2, 2027`

The label is visible text, not only an accessible name. It belongs to the same
period-control group as the navigation buttons and remains legible when the
toolbar switches to its mobile grid layout. Agenda view remains unchanged
because it does not display one bounded calendar period.

## Scope

- Add the formatted label to month and week views.
- Keep the label synchronized with URL anchor changes from previous, Today, and
  next controls.
- Preserve existing calendar anchoring, navigation, filters, and Agenda
  behavior.
- Do not change week boundaries or introduce localization settings.

## Testing

Add unit coverage for:

- a month label;
- a same-month week range;
- a cross-month week range; and
- a cross-year week range.

Add a component contract assertion that month and week controls render the
formatted label as visible content. Run the focused tests red before
implementation, then run the focused tests, full test suite, lint, build,
artifact validation, and browser inspection after implementation.
