# Dashboard Attachment Indicator Design

## Goal

Make attached files visible without opening a task or event. Every dashboard surface that renders a work-item title will show a small paperclip physically to the left of the title when that item has one or more attached files.

## Scope

The indicator applies to work-item titles in:

- Overview dashboard lists
- Tasks dashboard rows
- Events dashboard rows
- Timeline agenda, month, and week views
- Spending dashboard work-item rows
- Project collection task and event lists

Payment-history entries and file-management lists are outside this scope because they are not task or event title surfaces.

## Component Design

Add a shared `AttachmentIndicator` component that accepts a work item or its file count. It renders nothing when there are no attached files. Otherwise, it renders a compact paperclip glyph with an accessible label of `Has attached files`.

Use a shared work-item title wrapper wherever practical so the indicator and title keep the same ordering and spacing across dashboards. The wrapper will force a left-to-right visual row for placement while the title text itself uses automatic text direction. This keeps the paperclip physically left of English, Hebrew, and other right-to-left titles.

## Data Flow

No API, persistence, or schema changes are required. `WorkItemRecord.files` already contains the attached-file records in every workspace snapshot. Each dashboard passes the existing item data to the shared indicator.

## Styling and Accessibility

- Use the existing muted foreground color so the indicator is noticeable without competing with the title.
- Keep the glyph small enough for dense calendar cells and mobile rows.
- Preserve existing title wrapping and touch targets.
- Expose `Has attached files` to assistive technology while keeping the paperclip glyph itself decorative.
- Do not show an attachment count or reserve empty space when there are no files.

## Testing

Add contract coverage proving that the shared indicator:

- Depends on `item.files.length` and renders only for attached files.
- Appears in all global dashboard work-item surfaces.
- Appears in project collection task and event lists.
- Uses the shared physical-left title layout and retains responsive wrapping.

Run the full test suite and production build before publishing.

## Delivery

Commit the implementation to `main`, publish the exact validated revision to Project Harbor, and verify that the production deployment succeeds.
