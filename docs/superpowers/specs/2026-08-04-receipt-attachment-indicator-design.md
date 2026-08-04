# Receipt Attachment Indicator Design

## Goal

Show the existing paperclip beside a task or event title when the item has any
file visible in its Files tab, including a payment receipt.

## Current behavior and root cause

The shared `WorkItemTitle` component renders the paperclip only when
`item.files` contains an ordinary attachment. Payment receipts are represented
separately on `item.payments` through `receiptFileId`. The Files tab merges both
sources, but the title indicator does not, so items whose only file is a receipt
show no paperclip.

## Design

Add a small domain helper that reports whether a work item has any attached
file. It returns true when either:

- `item.files` contains at least one ordinary attachment; or
- at least one payment has a non-null `receiptFileId`.

`WorkItemTitle` will use this helper for its existing conditional indicator.
No dashboard, persistence, API, schema, or snapshot changes are needed because
all title surfaces already use the shared component and receipt identifiers are
already present in the workspace snapshot.

A payment without a receipt does not count as an attached file and does not
cause a paperclip to appear. The existing accessible label, `Has attached
files`, remains accurate because receipts are already displayed in the item's
Files tab.

## Testing

Add behavior-level unit coverage for the shared predicate:

- an ordinary attachment returns true;
- a receipt-only payment returns true;
- payments without receipts and an otherwise empty item return false.

Keep the existing source-level UI contracts to ensure every dashboard title
continues to render through `WorkItemTitle`, then run the focused tests, full
test suite, lint, and production build.

