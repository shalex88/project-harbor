import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const uploadedFilesModule = await import(
  new URL("../lib/item-uploaded-files.ts", import.meta.url)
).catch(() => ({}));
const itemSource = await readFile(
  new URL("app/components/item-sheet.tsx", root),
  "utf8",
);
const css = await readFile(new URL("app/globals.css", root), "utf8");
const repositorySource = await readFile(
  new URL("lib/repository.ts", root),
  "utf8",
);

test("uploaded files merge attachments and receipts newest first", () => {
  assert.equal(
    typeof uploadedFilesModule.buildUploadedFiles,
    "function",
    "uploaded-file presentation builder must exist",
  );
  const uploaded = uploadedFilesModule.buildUploadedFiles(
    [
      {
        id: "item-file-1",
        itemId: "item-1",
        fileObjectId: "file-1",
        filename: "plans.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048,
        uploadedBy: "user-1",
        uploadedByName: "Alex",
        createdAt: "2026-07-02T10:00:00.000Z",
      },
    ],
    [
      {
        id: "payment-1",
        itemId: "item-1",
        amountMinor: 100,
        paidOn: "2026-07-02",
        note: "Fee",
        createdBy: "user-1",
        createdByName: "Alex",
        receiptFileId: "receipt-1",
        receiptFilename: "receipt.pdf",
        receiptCreatedAt: "2026-07-03T10:00:00.000Z",
        createdAt: "2026-07-01T10:00:00.000Z",
        updatedAt: "2026-07-01T10:00:00.000Z",
      },
      {
        id: "payment-2",
        itemId: "item-1",
        amountMinor: 200,
        paidOn: "2026-07-03",
        note: "No receipt",
        createdBy: "user-1",
        createdByName: "Alex",
        receiptFileId: null,
        receiptFilename: null,
        receiptCreatedAt: null,
        createdAt: "2026-07-03T10:00:00.000Z",
        updatedAt: "2026-07-03T10:00:00.000Z",
      },
    ],
  );

  assert.deepEqual(
    uploaded.map(({ kind, filename, removable, detail }) => ({
      kind,
      filename,
      removable,
      detail,
    })),
    [
      {
        kind: "receipt",
        filename: "receipt.pdf",
        removable: false,
        detail: "Payment receipt · 2026-07-02",
      },
      {
        kind: "attachment",
        filename: "plans.pdf",
        removable: true,
        detail: "2.0 KB · application/pdf",
      },
    ],
  );
  assert.match(
    repositorySource,
    /fo\.created_at AS receipt_created_at/,
    "receipt sort time must come from the uploaded file",
  );
});

test("Files exposes receipt downloads and clear attachment removal", () => {
  assert.match(itemSource, /Files \(\$\{uploadedFiles\.length\}\)/);
  assert.match(itemSource, />Remove file</);
  assert.doesNotMatch(itemSource, /Pin file|Unpin file|className="file-mark"/);
});

test("Payment history keeps receipt access with uniformly aligned actions", () => {
  assert.match(itemSource, /payment-actions[\s\S]*?>Receipt</);
  assert.match(itemSource, /payment-actions[\s\S]*?>Edit</);
  assert.match(itemSource, /payment-actions[\s\S]*?>Delete</);
  assert.match(
    css,
    /\.payment-actions button,\s*\.payment-actions a\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?align-items:\s*center;/,
  );
  assert.match(
    css,
    /\.receipt-picker\s*\{[\s\S]*?display:\s*inline-flex;[\s\S]*?min-height:\s*36px;[\s\S]*?align-items:\s*center;/,
  );
  assert.match(
    css,
    /\.payment-history article\s*\{[\s\S]*?padding:\s*12px 14px 52px;/,
  );
});
