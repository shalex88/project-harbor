# Project Menu Overlay Design

**Date:** 2026-07-22
**Status:** Approved for implementation planning

## Goal

Opening a project’s `•••` menu must display a polished floating action menu
without moving, clipping, narrowing, or scrolling the Projects heading and
project rows in the desktop sidebar or mobile More sheet.

## Root Cause

The menu is absolutely positioned inside `.project-nav`, which is also the
scroll container for the project list. With two projects, opening the second
menu increases the container’s scrollable height from 124px to 185px. Moving
focus to `Export project` then changes `scrollTop` from 0 to 61px so the focused
menu item is visible. That scroll hides the Projects heading and clips the
first project row.

The opaque `--card` background is correct and remains unchanged. The visual
defect comes from the popup’s containing block and overflow boundary.

## Product Decisions

- The action menu floats over surrounding content. It does not consume layout
  space or change the project list’s scroll position.
- The menu is right-aligned with the pressed `•••` button and opens 6px below
  it when space permits.
- When there is not enough room below, the menu opens 6px above the trigger.
- The menu remains within an 8px viewport margin on every edge.
- The current opaque card surface, border, shadow, typography, icon, and 44px
  minimum action height remain unchanged.
- The same positioning behavior applies to the desktop sidebar and the mobile
  More sheet.
- Existing keyboard, focus, dismissal, busy-state, and export behavior remain
  unchanged.

## Component Design

### Positioning helper

Create `app/components/project-menu-position.ts` with a pure
`calculateProjectMenuPosition` function. It accepts the trigger rectangle,
measured menu size, viewport size, and optional gap/margin values. It returns
fixed-position `top` and `left` coordinates. The defaults are the approved 6px
trigger gap and 8px viewport margin.

The helper right-aligns the menu to the trigger, clamps the horizontal result
inside the viewport, prefers placement below, flips above when the below
position would cross the bottom margin, and finally clamps the vertical result
for unusually small viewports. Keeping this calculation independent of React
makes edge placement deterministic and directly testable.

### ProjectMenu portal

`ProjectMenu` continues to own open state, focus, keyboard navigation, and the
export callback. When open, it renders `.project-context-menu` through
`createPortal(..., document.body)` instead of as a descendant of the project
row.

After the portaled element mounts, a layout effect measures the trigger and
menu, calls `calculateProjectMenuPosition`, and writes the fixed coordinates to
the menu. The menu stays hidden until the first placement is available so it
cannot flash at the page origin. The component recalculates on window resize
and on captured scroll events, allowing it to follow a trigger inside any
scrollable ancestor.

The outside-pointer handler treats both the trigger container and the portaled
menu as inside targets. Otherwise pressing the portaled Export action would be
misclassified as an outside click. Escape still closes the menu and restores
trigger focus. Arrow keys still move through enabled menu items. `aria-controls`
continues to reference the portaled menu by its stable ID.

### Styling and stacking

`.project-context-menu` changes from `position: absolute` to
`position: fixed`. Inline `top` and `left` coordinates own placement, so the
old `top` and `right` anchor declarations are removed. The menu uses
`z-index: 120`, above the existing overlay layer’s `z-index: 100`, so it remains
visible when opened from the mobile More sheet.

The portal does not change `.project-nav` overflow behavior; long project lists
remain independently scrollable and the sidebar user block stays anchored at
the bottom.

## Data and Error Flow

This change does not alter project data, archive contents, API calls, downloads,
or error messages. Position recalculation reads DOM geometry only. If the menu
or trigger is unavailable during teardown, placement exits without work.

## Testing

### Positioning unit tests

- Right-align below a trigger when space is available.
- Flip above when the menu would cross the bottom margin.
- Clamp horizontally near the left and right viewport edges.
- Clamp vertically when the viewport is smaller than the preferred placement.

### UI contract tests

- `ProjectMenu` renders through `createPortal` into `document.body`.
- Outside-click containment checks include the portaled menu ref.
- The stylesheet uses fixed positioning and no longer anchors the menu with
  absolute `top`/`right` declarations.
- Existing menu roles, arrow-key navigation, Escape behavior, and focus
  restoration remain covered.

### Rendered regression

With exactly two visible projects, record the Projects heading and both row
rectangles, open the second menu, and verify:

- project-list `scrollTop` remains 0;
- the heading and row rectangles do not move;
- the menu is fully visible and does not change the list’s scroll height;
- the menu background is opaque;
- Export remains keyboard focused and actionable.

Repeat placement near the bottom of the viewport and from the mobile More
sheet to verify flip behavior and stacking.

## Out of Scope

- Adding more project actions.
- Changing project-row content or active-project styling.
- Replacing the project list’s scrolling behavior.
- Introducing a general-purpose popover framework for unrelated components.
