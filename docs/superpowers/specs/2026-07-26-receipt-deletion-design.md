# Receipt deletion design

## Goal

Replace the payment history's **Replace receipt** control with an explicit
**Delete receipt** action. Deleting a receipt must preserve its payment and
return the payment row to the **Upload receipt** state.

## User experience

- A manageable payment without a receipt shows **Upload receipt**.
- A manageable payment with a receipt shows **Delete receipt** in the same
  left-side action position.
- Selecting **Delete receipt** asks for confirmation with
  **Delete this receipt?**
- Cancelling leaves both the payment and receipt unchanged.
- Confirming removes only the receipt. The payment remains visible, and its
  action changes to **Upload receipt**.
- The existing **Receipt** download, **Edit**, and payment **Delete** actions
  remain unchanged.

## Implementation

The UI will conditionally render either the existing upload file picker or a
delete button. Receipt deletion will reuse the existing authenticated
`DELETE /api/files?id=...` flow and `onDeleteFile` callback. That flow already
checks project access and payment-management permissions, deletes the receipt
metadata, and removes the corresponding stored object.

No database, archive, or API schema changes are required.

## Error handling

If deletion fails, the existing file-removal error path keeps the current
workspace snapshot and displays an error toast. The receipt remains available.

## Verification

Regression coverage will prove that:

- **Replace receipt** is absent.
- Payments without receipts retain **Upload receipt**.
- Payments with receipts expose **Delete receipt**.
- The delete action confirms before calling `onDeleteFile` with the receipt's
  file-object ID.
- Payment deletion remains a separate action.

The focused receipt UI tests, full test suite, lint, production build, and
artifact validation must pass before the change is pushed.
