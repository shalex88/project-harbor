import { DomainError } from "./domain.ts";

const MAX_FILENAME_LENGTH = 160;
const UNSAFE_BASE_NAME = /[\/\\\u0000-\u001f\u007f]/;

type RenameInput = { baseName: string };

export function splitFilename(filename: string): {
  baseName: string;
  extension: string;
} {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) {
    return { baseName: filename, extension: "" };
  }
  return {
    baseName: filename.slice(0, dot),
    extension: filename.slice(dot),
  };
}

export function parseFileRenameInput(input: unknown): RenameInput {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new DomainError("Request body must be an object");
  }
  const value = input as Record<string, unknown>;
  const unknown = Object.keys(value).find((key) => key !== "baseName");
  if (unknown) throw new DomainError(`unsupported field: ${unknown}`);
  if (typeof value.baseName !== "string") {
    throw new DomainError("File name is required");
  }
  return { baseName: value.baseName };
}

export function renamedFilename(
  currentFilename: string,
  requestedBaseName: string,
): string {
  const baseName = requestedBaseName.trim();
  if (!baseName) throw new DomainError("File name is required");
  if (UNSAFE_BASE_NAME.test(baseName)) {
    throw new DomainError("File name contains unsafe characters");
  }
  const { extension } = splitFilename(currentFilename);
  const filename = `${baseName}${extension}`;
  if (filename.length > MAX_FILENAME_LENGTH) {
    throw new DomainError("File name must be 160 characters or less");
  }
  return filename;
}
