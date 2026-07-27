import {
  canManagePayment,
  type ProjectActor,
} from "./authorization.ts";
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
      renameable: boolean;
    }
  | {
      kind: "receipt";
      id: string;
      fileObjectId: string;
      filename: string;
      createdAt: string;
      detail: string;
      removable: false;
      renameable: boolean;
    };

export function buildUploadedFiles(
  attachments: ItemFileRecord[],
  payments: PaymentRecord[],
  actor: ProjectActor | null,
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
        renameable: actor !== null,
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
              createdAt: payment.receiptCreatedAt ?? payment.createdAt,
              detail: `Payment receipt · ${payment.paidOn}`,
              removable: false,
              renameable: actor ? canManagePayment(actor, payment) : false,
            },
          ]
        : [],
    ),
  ].sort(
    (a, b) =>
      b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
  );
}
