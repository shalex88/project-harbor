import type { ItemFileRecord, PaymentRecord } from "./domain.ts";

export type UploadedItemFile =
  | {
      kind: "attachment";
      id: string;
      fileObjectId: string;
      filename: string;
      createdAt: string;
      detail: string;
      removable: true;
    }
  | {
      kind: "receipt";
      id: string;
      fileObjectId: string;
      filename: string;
      createdAt: string;
      detail: string;
      removable: false;
    };

export function buildUploadedFiles(
  attachments: ItemFileRecord[],
  payments: PaymentRecord[],
): UploadedItemFile[] {
  return [
    ...attachments.map(
      (file): UploadedItemFile => ({
        kind: "attachment",
        id: file.id,
        fileObjectId: file.fileObjectId,
        filename: file.filename,
        createdAt: file.createdAt,
        detail: `${(file.sizeBytes / 1024).toFixed(file.sizeBytes > 1024 * 1024 ? 0 : 1)} KB · ${file.contentType}`,
        removable: true,
      }),
    ),
    ...payments.flatMap((payment): UploadedItemFile[] =>
      payment.receiptFileId && payment.receiptFilename
        ? [
            {
              kind: "receipt",
              id: `receipt-${payment.id}`,
              fileObjectId: payment.receiptFileId,
              filename: payment.receiptFilename,
              createdAt: payment.createdAt,
              detail: `Payment receipt · ${payment.paidOn}`,
              removable: false,
            },
          ]
        : [],
    ),
  ].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}
