# Agenda Date Sort Design

Date: 2026-07-16

## Goal

Add a compact date-sort control to the right side of the Timeline Agenda panel header. The Agenda list defaults to newest dates first and can be toggled to oldest dates first without changing Month or Week behavior.

## Interaction

- The sort control appears only in Agenda view, using the existing panel-header action area.
- The default order is descending by date, so the latest date is at the top.
- Activating the control toggles between descending and ascending date order.
- The arrow direction reflects the active order.
- The accessible label describes the action that will occur, such as `Sort agenda oldest first` while descending order is active.
- The non-default ascending order is stored in the Timeline URL. Descending order omits the parameter, preserving a clean default URL and surviving refresh or authorized sharing.

## Implementation Boundaries

`TimelineDashboard` owns the Agenda order because it is presentation state. The existing `projectTimeline` domain helper remains unchanged so Month and Week retain their current chronological data projection. After the existing filters run, Agenda creates a sorted copy of the entries, groups that copy by date, and renders those groups in the selected direction. Items sharing a date retain the existing title ordering.

The existing `Panel` action slot renders the button at the right edge of the selected header. A focused Agenda-specific CSS class provides the arrow treatment while reusing the current button, hover, focus, touch-target, and reduced-motion conventions.

## State and Failure Behavior

The order is read through the existing URL-filter utility. Only `asc` selects ascending order; missing or unsupported values fall back to descending. Sorting is entirely client-side over the already loaded and authorized snapshot, so it introduces no loading, persistence, mutation, or error state.

## Verification

- A focused contract test verifies that Agenda defaults to descending order and exposes the accessible toggle labels.
- A domain-level or extracted pure sorting test verifies descending and ascending date order, including stable title ordering for matching dates.
- The full test suite and production build must pass.
- Browser behavior should show the latest Agenda date at the top initially and reverse the groups after one activation, while Month and Week remain unchanged.
