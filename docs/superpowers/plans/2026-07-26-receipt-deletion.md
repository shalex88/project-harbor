# Receipt Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace receipt replacement with confirmed receipt deletion while preserving the payment and its ability to accept a new receipt.

**Architecture:** Add a small presentation helper that chooses the permitted receipt action and owns the confirmation-before-delete flow. The payment-history component renders that result and reuses the existing authenticated file deletion callback; no API or persistence changes are needed.

**Tech Stack:** TypeScript, React 19, Node test runner, Vinext/Vite.

## Global Constraints

- A payment without a receipt shows **Upload receipt**.
- A payment with a receipt shows **Delete receipt**, never **Replace receipt**.
- Receipt deletion requires the confirmation text **Delete this receipt?**
- Deleting a receipt must not delete its payment.
- Existing receipt download, payment edit, and payment delete actions remain unchanged.
- Reuse the existing `DELETE /api/files?id=...` flow.

---

### Task 1: Receipt action behavior and payment-history UI

**Files:**
- Create: `lib/payment-receipt-actions.ts`
- Create: `tests/payment-receipt-actions.test.mjs`
- Modify: `app/components/item-sheet.tsx:1-430`
- Modify: `tests/receipt-files-ui.test.mjs`

**Interfaces:**
- Consumes: `PaymentRecord.receiptFileId: string | null` and the existing `onDeleteFile(fileObjectId: string): Promise<void>` callback.
- Produces: `getReceiptAction(receiptFileId, canManage)` and `confirmReceiptDeletion(fileObjectId, confirmDelete, onDeleteFile)`.

- [x] **Step 1: Write failing behavior tests**

Create `tests/payment-receipt-actions.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import {
  confirmReceiptDeletion,
  getReceiptAction,
} from "../lib/payment-receipt-actions.ts";

test("manageable payments expose upload or delete according to receipt state", () => {
  assert.deepEqual(getReceiptAction(null, true), {
    kind: "upload",
    label: "Upload receipt",
  });
  assert.deepEqual(getReceiptAction("receipt-1", true), {
    kind: "delete",
    label: "Delete receipt",
    fileObjectId: "receipt-1",
  });
  assert.equal(getReceiptAction("receipt-1", false), null);
});

test("receipt deletion requires confirmation and passes the receipt file id", async () => {
  const deleted = [];
  const cancelled = await confirmReceiptDeletion(
    "receipt-1",
    () => false,
    async (fileObjectId) => deleted.push(fileObjectId),
  );
  assert.equal(cancelled, false);
  assert.deepEqual(deleted, []);

  let prompt = "";
  const confirmed = await confirmReceiptDeletion(
    "receipt-1",
    (message) => {
      prompt = message;
      return true;
    },
    async (fileObjectId) => deleted.push(fileObjectId),
  );
  assert.equal(prompt, "Delete this receipt?");
  assert.equal(confirmed, true);
  assert.deepEqual(deleted, ["receipt-1"]);
});
```

Update `tests/receipt-files-ui.test.mjs` so its payment-history contract requires
`Delete receipt`, retains `Upload receipt`, and rejects `Replace receipt`.

- [x] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npx -y node@24 --experimental-strip-types --test \
  tests/payment-receipt-actions.test.mjs \
  tests/receipt-files-ui.test.mjs
```

Expected: FAIL because `lib/payment-receipt-actions.ts` and the new delete receipt UI do not exist.

- [x] **Step 3: Implement the minimal receipt action helper**

Create `lib/payment-receipt-actions.ts`:

```ts
export type ReceiptAction =
  | { kind: "upload"; label: "Upload receipt" }
  | {
      kind: "delete";
      label: "Delete receipt";
      fileObjectId: string;
    }
  | null;

export function getReceiptAction(
  receiptFileId: string | null,
  canManage: boolean,
): ReceiptAction {
  if (!canManage) return null;
  return receiptFileId
    ? {
        kind: "delete",
        label: "Delete receipt",
        fileObjectId: receiptFileId,
      }
    : { kind: "upload", label: "Upload receipt" };
}

export async function confirmReceiptDeletion(
  fileObjectId: string,
  confirmDelete: (message: string) => boolean,
  onDeleteFile: (fileObjectId: string) => Promise<void>,
): Promise<boolean> {
  if (!confirmDelete("Delete this receipt?")) return false;
  await onDeleteFile(fileObjectId);
  return true;
}
```

- [x] **Step 4: Render upload-or-delete in payment history**

In `app/components/item-sheet.tsx`, import the two helpers. For each payment,
derive `receiptAction` inside the map callback. Render:

```tsx
{receiptAction?.kind === "delete" ? (
  <button
    className="receipt-picker"
    type="button"
    disabled={pending}
    onClick={() =>
      void confirmReceiptDeletion(
        receiptAction.fileObjectId,
        window.confirm,
        onDeleteFile,
      )
    }
  >
    {receiptAction.label}
  </button>
) : receiptAction?.kind === "upload" ? (
  <label className="receipt-picker">
    {receiptAction.label}
    <input
      type="file"
      accept="image/*,application/pdf"
      capture="environment"
      onChange={(event) => {
        const file = event.target.files?.[0];
        if (file) void onUpload({ paymentId: payment.id }, file);
      }}
    />
  </label>
) : null}
```

Keep the `Receipt`, `Edit`, and payment `Delete` actions unchanged.

- [x] **Step 5: Run focused tests and verify GREEN**

Run:

```bash
npx -y node@24 --experimental-strip-types --test \
  tests/payment-receipt-actions.test.mjs \
  tests/receipt-files-ui.test.mjs \
  tests/workflow-contract.test.mjs
```

Expected: all focused tests pass.

- [x] **Step 6: Run full verification**

Run the full suite with Node 24, followed by:

```bash
npm run lint
npm run validate:artifact
```

Expected: build, all tests, lint, and artifact validation pass.

- [x] **Step 7: Commit and push**

```bash
git add \
  app/components/item-sheet.tsx \
  lib/payment-receipt-actions.ts \
  tests/payment-receipt-actions.test.mjs \
  tests/receipt-files-ui.test.mjs \
  docs/superpowers/plans/2026-07-26-receipt-deletion.md
git commit -m "feat: add receipt deletion action"
git push
```

Confirm the updated PR check succeeds.
