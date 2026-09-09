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
        payments: [
          { id: "payment-concurrent" },
          { id: "payment-old" },
          { id: "payment-new" },
        ],
      },
    ],
  };

  const result = await paymentCreationModule.createPaymentWithOptionalReceipt({
    mutation,
    receipt,
    mutate: async (receivedMutation) => {
      events.push(["mutate", receivedMutation]);
      return {
        snapshot,
        createdItemId: null,
        createdPaymentId: "payment-new",
      };
    },
    onPaymentCreated: (createdSnapshot) => {
      events.push(["created", createdSnapshot]);
    },
    upload: async (target, receivedReceipt, options) => {
      events.push(["upload", target, receivedReceipt, options]);
    },
  });

  assert.equal(result.snapshot, snapshot);
  assert.deepEqual(events, [
    ["mutate", mutation],
    ["created", snapshot],
    ["upload", { paymentId: "payment-new" }, receipt, { notifySuccess: false }],
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
    receipt: null,
    mutate: async () => ({
      snapshot,
      createdItemId: null,
      createdPaymentId: "payment-new",
    }),
    upload: async () => {
      uploadCount += 1;
    },
  });

  assert.equal(result.snapshot, snapshot);
  assert.equal(uploadCount, 0);
});

test("a receipt upload failure preserves the single successful payment creation", async () => {
  let mutationCount = 0;
  const events = [];
  const uploadError = new Error("Receipt upload failed");
  const snapshot = {
    items: [{ id: "item-1", payments: [{ id: "payment-new" }] }],
  };

  await assert.rejects(
    paymentCreationModule.createPaymentWithOptionalReceipt({
      mutation: {
        action: "create_payment",
        itemId: "item-1",
        amountMinor: 100,
        paidOn: "2026-09-09",
        note: "",
      },
      receipt: { name: "receipt.pdf", size: 2048 },
      mutate: async () => {
        mutationCount += 1;
        events.push("mutate");
        return {
          snapshot,
          createdItemId: null,
          createdPaymentId: "payment-new",
        };
      },
      onPaymentCreated: () => events.push("created"),
      upload: async () => {
        events.push("upload");
        throw uploadError;
      },
    }),
    uploadError,
  );

  assert.equal(mutationCount, 1);
  assert.deepEqual(events, ["mutate", "created", "upload"]);
});
