# Past Agenda Items Design

Date: 2026-07-16

## Goal

Make Agenda items dated before the viewer's current local date easy to distinguish using gray styling only, while preserving their existing interaction behavior.

## Date Semantics

- An Agenda date is past when its `YYYY-MM-DD` value is earlier than the viewer's browser-local current date.
- Today's items are not past.
- Future items are not past.
- The comparison applies only to Agenda view. Month and Week remain unchanged.

## Presentation

The past state applies to the entire Agenda date group so its date header and every item in that group read as one historical section. Past groups use muted gray text, desaturated task/event labels, reduced contrast, and a subtle darker background. They do not add a label, icon, border accent, or other status marker.

Past item buttons remain fully clickable and retain the same layout, focus behavior, and hit area as current and future items. The gray treatment must not make text unreadable against the dark workspace background.

## Implementation Boundaries

A small pure helper compares an Agenda ISO date with a supplied local-today ISO date. `TimelineDashboard` obtains the browser-local current date through the existing `todayIso()` boundary and applies `agenda-day-past` to an Agenda group when the helper returns true.

Focused CSS targets the past group header, item text, metadata, and type label. Existing base Agenda styles remain unchanged for today and future dates.

## Failure Behavior

Agenda dates are already normalized ISO calendar strings by the domain projection. The helper treats only lexically earlier ISO dates as past; equal or later values remain unstyled. No persistence, mutation, loading state, or network request is introduced.

## Verification

- A pure unit test verifies that yesterday is past while today and tomorrow are not.
- A dashboard contract test verifies the past class is applied from the date comparison.
- A CSS contract verifies the gray treatment exists without adding a `Past` label.
- The production build, full test suite, and lint must pass.
- The live Agenda must visibly mute July 16 when the browser-local date is later than July 16, while later dates retain the existing task/event colors.
