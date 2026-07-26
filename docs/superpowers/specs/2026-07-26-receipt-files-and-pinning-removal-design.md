# Receipt files and pinning removal design

## Goal

Make uploaded payment receipts visible alongside ordinary item attachments,
keep receipt access in payment history, align the payment actions, and remove
attachment pinning completely.

## Files tab

The Files tab presents one newest-first list derived from two existing sources:
the item's ordinary attachments and the receipts attached to its payments.
This is a presentation-only merge; receipts remain owned by their payments and
ordinary attachments remain owned by the item.

Ordinary attachment rows show the filename, size, content type, Download, and a
clearly labeled Remove file action. Receipt rows show the stored filename,
identify the file as a payment receipt with its payment date, and offer
Download. Receipt upload and replacement remain in Payment history so a receipt
continues to have one lifecycle owner.

The empty state appears only when the item has neither ordinary attachments nor
payment receipts. The Files tab count includes both kinds of uploaded file.

## Payment history

An existing receipt remains downloadable from its payment row. Receipt, Edit,
and Delete use the same inline-flex control layout, dimensions, and vertical
centering at desktop and mobile widths. Upload receipt and Replace receipt
remain separate controls because they operate the file picker rather than the
payment itself.

## Pinning removal

Remove pinning from every active application layer:

- remove Pin file and Unpin file controls, pin markers, pinned styling, and
  pinned-first sorting;
- remove the pin callback and client PATCH request;
- remove the files-route PATCH handler and repository update method;
- remove `pinned` from the item-file domain record;
- remove `pinned` from project archive exports and active archive types;
- remove the database column and its index component.

The database migration rebuilds `item_files` without `pinned` and copies every
existing relationship, preserving IDs, item/file ownership, position, and
timestamps. Ordinary files remain ordered by creation time, with position as a
stable secondary key.

Existing version-1 project archives may contain a boolean `pinned` property.
The importer accepts and ignores that legacy property so existing backups
remain usable. New exports omit it. This compatibility rule does not expose a
pinning state to the domain model or persist one after import.

## Data and authorization

No receipt, attachment, object-storage, payment, or permission model changes.
The Files tab uses receipt IDs and filenames already present in payment records.
Download and deletion continue through the protected file endpoint. Only
ordinary item attachments expose Remove file; receipt replacement and removal
remain governed by their payment workflow.

## Testing and verification

Add or update tests to prove:

- the Files tab count and list include payment receipts while the Payment
  history Receipt link remains;
- attachment rows expose Download and Remove file without any pinning control;
- Receipt, Edit, and Delete share the same alignment contract;
- domain snapshots, repository queries, routes, and new archives no longer
  expose pinning;
- legacy archives containing `pinned` still import, while new exports omit it;
- the schema migration preserves existing `item_files` rows and removes the
  column.

Run focused tests first, then the complete build/test suite and lint. Inspect the
rendered Files and Payments tabs at desktop and mobile widths before completion.
