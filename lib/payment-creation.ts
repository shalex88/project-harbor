import type { WorkspaceMutation, WorkspaceSnapshot } from "./domain";

type CreatePaymentMutation = Extract<
  WorkspaceMutation,
  { action: "create_payment" }
>;

export async function createPaymentWithOptionalReceipt({
  mutation,
  existingPaymentIds,
  receipt,
  mutate,
  upload,
  onPaymentCreated,
}: {
  mutation: CreatePaymentMutation;
  existingPaymentIds: readonly string[];
  receipt: File | null;
  mutate: (mutation: WorkspaceMutation) => Promise<WorkspaceSnapshot>;
  upload: (target: { paymentId: string }, file: File) => Promise<void>;
  onPaymentCreated?: (snapshot: WorkspaceSnapshot) => void;
}): Promise<WorkspaceSnapshot> {
  const snapshot = await mutate(mutation);
  onPaymentCreated?.(snapshot);

  if (!receipt) return snapshot;

  const previousIds = new Set(existingPaymentIds);
  const createdPayment = snapshot.items
    .find((candidate) => candidate.id === mutation.itemId)
    ?.payments.find((payment) => !previousIds.has(payment.id));

  if (!createdPayment) {
    throw new Error(
      "Payment saved, but the receipt could not be attached. Upload it from payment history.",
    );
  }

  await upload({ paymentId: createdPayment.id }, receipt);
  return snapshot;
}
