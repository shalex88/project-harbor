import type {
  WorkspaceMutation,
  WorkspaceMutationResult,
  WorkspaceSnapshot,
} from "./domain";

type CreatePaymentMutation = Extract<
  WorkspaceMutation,
  { action: "create_payment" }
>;

export async function createPaymentWithOptionalReceipt({
  mutation,
  receipt,
  mutate,
  upload,
  onPaymentCreated,
}: {
  mutation: CreatePaymentMutation;
  receipt: File | null;
  mutate: (mutation: WorkspaceMutation) => Promise<WorkspaceMutationResult>;
  upload: (target: { paymentId: string }, file: File, options?: { notifySuccess?: boolean }) => Promise<void>;
  onPaymentCreated?: (snapshot: WorkspaceSnapshot) => void;
}): Promise<WorkspaceMutationResult> {
  const result = await mutate(mutation);
  onPaymentCreated?.(result.snapshot);

  if (!receipt) return result;

  if (!result.createdPaymentId) {
    throw new Error(
      "Payment saved, but the receipt could not be attached. Upload it from payment history.",
    );
  }

  await upload({ paymentId: result.createdPaymentId }, receipt, { notifySuccess: false });
  return result;
}
