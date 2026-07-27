import { DomainError } from "./domain.ts";
import { MAX_UPLOAD_BYTES } from "./chunked-upload.ts";

type FileDescriptor = { name: string; type: string; size: number };
export type UploadKind = "item" | "receipt";
const ARCHIVE_ITEM_MAX_BYTES = 25 * 1024 * 1024;
const ARCHIVE_RECEIPT_MAX_BYTES = 10 * 1024 * 1024;

const EXECUTABLE_EXTENSIONS = new Set([
  "app",
  "bat",
  "bin",
  "cmd",
  "com",
  "cpl",
  "dll",
  "dmg",
  "exe",
  "gadget",
  "hta",
  "ins",
  "iso",
  "jar",
  "js",
  "jse",
  "lnk",
  "msi",
  "msp",
  "pif",
  "ps1",
  "reg",
  "scr",
  "sh",
  "vbe",
  "vbs",
  "wsf",
]);

function safeFilename(value: string): string {
  const leaf = value.split(/[\\/]/).at(-1) ?? "file";
  const cleaned = leaf.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  return (cleaned || "file").slice(0, 160);
}

function validateUploadWithLimit(
  file: FileDescriptor,
  kind: UploadKind,
  maximumBytes: number,
  maximumLabel: string,
): { filename: string; contentType: string; sizeBytes: number } {
  const filename = safeFilename(file.name);
  const contentType = file.type || "application/octet-stream";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new DomainError("Choose a non-empty file");
  }
  if (file.size > maximumBytes) {
    throw new DomainError(`Files must be ${maximumLabel} or smaller`);
  }
  const extension = filename.includes(".")
    ? filename.split(".").at(-1)?.toLowerCase() ?? ""
    : "";
  if (
    EXECUTABLE_EXTENSIONS.has(extension) ||
    /(?:x-msdownload|x-executable|x-sh|javascript)/i.test(contentType)
  ) {
    throw new DomainError("That executable file type is unsupported");
  }
  if (
    kind === "receipt" &&
    contentType !== "application/pdf" &&
    !contentType.startsWith("image/")
  ) {
    throw new DomainError("A receipt must be an image or PDF");
  }
  return { filename, contentType, sizeBytes: file.size };
}

export function validateUpload(
  file: FileDescriptor,
  kind: UploadKind,
): { filename: string; contentType: string; sizeBytes: number } {
  return validateUploadWithLimit(file, kind, MAX_UPLOAD_BYTES, "5 MB");
}

export function validateArchiveUpload(
  file: FileDescriptor,
  kind: UploadKind,
): { filename: string; contentType: string; sizeBytes: number } {
  const maximumBytes =
    kind === "receipt" ? ARCHIVE_RECEIPT_MAX_BYTES : ARCHIVE_ITEM_MAX_BYTES;
  const maximumLabel = kind === "receipt" ? "10 MB" : "25 MB";
  return validateUploadWithLimit(file, kind, maximumBytes, maximumLabel);
}
