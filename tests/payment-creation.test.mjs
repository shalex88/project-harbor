import assert from "node:assert/strict";
import test from "node:test";

const paymentCreationModule = await import(
  new URL("../lib/payment-creation.ts", import.meta.url),
).catch(() => ({}));

test("a new payment uploads its selected receipt against the created payment", async () => {
  assert.equal(
    typeof paymentCreationModule.createPaymentWithOptionalReceipt,
    "function",
    "payment creation helper must exist",
  );

  const events = [];
  const receipt = { name: "receipt.pdf", size: 2048 };
  const mutation = {
    action: "create_payment",
    itemId: "item-1",
    amountMinor: 99000,
    paidOn: "2026-09-09",
    note: "Materials",
  };
  const snapshot = {
    items: [
      {
        id: "item-1",
        payments: [{ id: "payment-old" }, { id: "payment-new" }],
      },
    ],
  };

  const result = await paymentCreationModule.createPaymentWithOptionalReceipt({
    mutation,
    existingPaymentIds: ["payment-old"],
    receipt,
    mutate: async (receivedMutation) => {
      events.push(["mutate", receivedMutation]);
      return snapshot;
    },
    onPaymentCreated: (createdSnapshot) => {
      events.push(["created", createdSnapshot]);
    },
    upload: async (target, receivedReceipt) => {
      events.push(["upload", target, receivedReceipt]);
    },
  });

  assert.equal(result, snapshot);
  assert.deepEqual(events, [
    ["mutate", mutation],
    ["created", snapshot],
    ["upload", { paymentId: "payment-new" }, receipt],
  ]);
});

test("a new payment without a receipt only creates the payment", async () => {
  assert.equal(
    typeof paymentCreationModule.createPaymentWithOptionalReceipt,
    "function",
    "payment creation helper must exist",
  );

  let uploadCount = 0;
  const snapshot = {
    items: [{ id: "item-1", payments: [{ id: "payment-new" }] }],
  };
  const result = await paymentCreationModule.createPaymentWithOptionalReceipt({
    mutation: {
      action: "create_payment",
      itemId: "item-1",
      amountMinor: 100,
      paidOn: "2026-09-09",
      note: "",
    },
    existingPaymentIds: [],
    receipt: null,
    mutate: async () => snapshot,
    upload: async () => {
      uploadCount += 1;
    },
  });

  assert.equal(result, snapshot);
  assert.equal(uploadCount, 0);
});
