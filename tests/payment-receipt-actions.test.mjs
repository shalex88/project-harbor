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
