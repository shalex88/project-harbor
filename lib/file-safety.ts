import { DomainError } from "./domain.ts";

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

export function assertSupportedFilename(filename: string): void {
  const normalized = filename.replace(/[. ]+$/g, "");
  const extension = normalized.includes(".")
    ? normalized.split(".").at(-1)?.toLowerCase() ?? ""
    : "";
  if (EXECUTABLE_EXTENSIONS.has(extension)) {
    throw new DomainError("That executable file type is unsupported");
  }
}
