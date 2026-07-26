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
