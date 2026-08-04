# Receipt Attachment Indicator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show the existing title paperclip when a task or event has an ordinary attachment or a payment receipt.

**Architecture:** Add one pure domain predicate over the two existing file sources and make the shared `WorkItemTitle` component use it. All dashboard and project-list surfaces inherit the behavior without data-model or persistence changes.

**Tech Stack:** TypeScript, React 19 server rendering, Node.js test runner, `tsx`

## Global Constraints

- A payment without a receipt must not cause a paperclip to appear.
- Keep the existing `Has attached files` accessible label and paperclip styling.
- Do not change APIs, persistence, schemas, snapshot loading, or individual dashboard surfaces.

---

### Task 1: Recognize receipts as attached files in work-item titles

**Files:**
- Modify: `lib/domain.ts:125-159,500-540`
- Modify: `app/components/work-item-title.tsx:1-31`
- Modify: `tests/domain.test.mjs:1-20,40-80`
- Modify: `tests/attachment-indicator-contract.test.mjs:1-60`

**Interfaces:**
- Consumes: `Pick<WorkItemRecord, "files" | "payments">`
- Produces: `hasAttachedFiles(item): boolean`
- Produces: rendered `.attachment-indicator` for ordinary attachments and receipt-only payments

- [ ] **Step 1: Write failing predicate and rendered-behavior tests**

Import the domain module as a namespace in `tests/domain.test.mjs` so the missing helper produces an assertion failure rather than a module-load error. Assert literal outcomes for an ordinary attachment, a receipt-only payment, and a payment without a receipt:

```js
import * as domain from "../lib/domain.ts";

test("attached files include ordinary attachments and payment receipts", () => {
  assert.equal(typeof domain.hasAttachedFiles, "function");
  assert.equal(domain.hasAttachedFiles({ files: [{}], payments: [] }), true);
  assert.equal(
    domain.hasAttachedFiles({
      files: [],
      payments: [{ receiptFileId: "receipt-1" }],
    }),
    true,
  );
  assert.equal(
    domain.hasAttachedFiles({
      files: [],
      payments: [{ receiptFileId: null }],
    }),
    false,
  );
});
```

In `tests/attachment-indicator-contract.test.mjs`, render the real component with `react-dom/server` in a `tsx` child process. Assert that `.attachment-indicator` appears for the ordinary-attachment and receipt-only fixtures but not for the payment-without-receipt fixture.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
node --experimental-strip-types --test tests/domain.test.mjs tests/attachment-indicator-contract.test.mjs
```

Expected: FAIL because `domain.hasAttachedFiles` is absent and the receipt-only rendered title lacks `.attachment-indicator`.

- [ ] **Step 3: Implement the minimal shared predicate**

Add this pure helper to `lib/domain.ts`:

```ts
export function hasAttachedFiles(
  item: Pick<WorkItemRecord, "files" | "payments">,
): boolean {
  return (
    item.files.length > 0 ||
    item.payments.some((payment) => payment.receiptFileId !== null)
  );
}
```

Update `WorkItemTitle` to import `hasAttachedFiles`, include `payments` in its `Pick`, and replace `item.files.length > 0` with `hasAttachedFiles(item)`. Do not change the indicator markup or labels.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
node --experimental-strip-types --test tests/domain.test.mjs tests/attachment-indicator-contract.test.mjs
```

Expected: all focused tests PASS.

- [ ] **Step 5: Run project verification**

Run:

```bash
npm test
npm run lint
npm run build
git diff --check
```

Expected: every command exits 0 with no new warnings or errors.

- [ ] **Step 6: Commit the implementation**

```bash
git add lib/domain.ts app/components/work-item-title.tsx tests/domain.test.mjs tests/attachment-indicator-contract.test.mjs
git commit -m "fix: show receipt attachment indicators"
```

- [ ] **Step 7: Publish for review**

Push `fix/receipt-attachment-indicator`, open a pull request against `main`, and confirm the PR URL and open state.

