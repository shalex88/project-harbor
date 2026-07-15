import { DomainError } from "./domain.ts";

type FileDescriptor = { name: string; type: string; size: number };
export type UploadKind = "item" | "receipt";

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

export function validateUpload(
  file: FileDescriptor,
  kind: UploadKind,
): { filename: string; contentType: string; sizeBytes: number } {
  const filename = safeFilename(file.name);
  const contentType = file.type || "application/octet-stream";
  if (!Number.isSafeInteger(file.size) || file.size <= 0) {
    throw new DomainError("Choose a non-empty file");
  }
  const max = kind === "receipt" ? 10 * 1024 * 1024 : 25 * 1024 * 1024;
  if (file.size > max) {
    throw new DomainError(
      kind === "receipt"
        ? "Receipts must be 10 MB or smaller"
        : "Files must be 25 MB or smaller",
    );
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
