import { strToU8, unzipSync, zipSync, type Zippable } from "fflate";
import { DomainError } from "./domain.ts";
import {
  MAX_ARCHIVE_BYTES,
  MAX_ARCHIVE_ENTRIES,
  MAX_EXPANDED_BYTES,
  MAX_MANIFEST_BYTES,
  archivePayloads,
  parseProjectArchiveManifest,
  validateArchivePayloads,
  type ProjectArchiveManifestV1,
} from "./project-archive.ts";

const LOCAL_FILE_HEADER = 0x04034b50;
const CENTRAL_FILE_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_EPOCH = new Date("1980-01-01T00:00:00.000Z");

type EntryMetadata = {
  path: string;
  compressedSize: number;
  uncompressedSize: number;
};

export type DecodedProjectArchive = {
  manifest: ProjectArchiveManifestV1;
  payloads: Map<string, Uint8Array>;
};

function damagedArchive(): DomainError {
  return new DomainError("This archive is damaged or incomplete");
}

function readUint16(view: DataView, offset: number): number {
  if (offset < 0 || offset + 2 > view.byteLength) throw damagedArchive();
  return view.getUint16(offset, true);
}

function readUint32(view: DataView, offset: number): number {
  if (offset < 0 || offset + 4 > view.byteLength) throw damagedArchive();
  return view.getUint32(offset, true);
}

function findEndOfCentralDirectory(view: DataView): number {
  const minimum = Math.max(0, view.byteLength - 65_557);
  for (let offset = view.byteLength - 22; offset >= minimum; offset -= 1) {
    if (readUint32(view, offset) === END_OF_CENTRAL_DIRECTORY) return offset;
  }
  throw damagedArchive();
}

function decodeEntryName(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new DomainError("unsafe archive path");
  }
}

function normalizedEntryPath(path: string): string {
  if (
    !path ||
    path.length > 240 ||
    path.startsWith("/") ||
    path.includes("\\") ||
    path.includes("//") ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new DomainError("unsafe archive path");
  }
  const normalized = path.normalize("NFC");
  const segments = normalized.split("/");
  if (segments.some((segment) => !segment || segment === "." || segment === "..")) {
    throw new DomainError("unsafe archive path");
  }
  if (normalized === "manifest.json") return normalized;
  if (
    segments.length !== 2 ||
    (segments[0] !== "attachments" && segments[0] !== "receipts")
  ) {
    throw new DomainError("Unexpected archive entry");
  }
  return normalized;
}

function inspectZipHeaders(bytes: Uint8Array): Map<string, EntryMetadata> {
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new DomainError("This archive is too large");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const endOffset = findEndOfCentralDirectory(view);
  const diskNumber = readUint16(view, endOffset + 4);
  const centralDisk = readUint16(view, endOffset + 6);
  const diskEntries = readUint16(view, endOffset + 8);
  const totalEntries = readUint16(view, endOffset + 10);
  const centralSize = readUint32(view, endOffset + 12);
  const centralOffset = readUint32(view, endOffset + 16);
  const commentLength = readUint16(view, endOffset + 20);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    diskEntries !== totalEntries ||
    totalEntries > MAX_ARCHIVE_ENTRIES ||
    centralOffset === 0xffffffff ||
    centralSize === 0xffffffff ||
    endOffset + 22 + commentLength !== bytes.byteLength ||
    centralOffset + centralSize !== endOffset
  ) {
    throw damagedArchive();
  }

  const entries = new Map<string, EntryMetadata>();
  let expandedBytes = 0;
  let offset = centralOffset;
  for (let index = 0; index < totalEntries; index += 1) {
    if (readUint32(view, offset) !== CENTRAL_FILE_HEADER) {
      throw damagedArchive();
    }
    const flags = readUint16(view, offset + 8);
    const method = readUint16(view, offset + 10);
    const compressedSize = readUint32(view, offset + 20);
    const uncompressedSize = readUint32(view, offset + 24);
    const nameLength = readUint16(view, offset + 28);
    const extraLength = readUint16(view, offset + 30);
    const entryCommentLength = readUint16(view, offset + 32);
    const externalAttributes = readUint32(view, offset + 38);
    const localOffset = readUint32(view, offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;
    if (
      compressedSize === 0xffffffff ||
      uncompressedSize === 0xffffffff ||
      localOffset === 0xffffffff ||
      nameEnd + extraLength + entryCommentLength > endOffset
    ) {
      throw damagedArchive();
    }
    const rawPath = decodeEntryName(bytes.subarray(nameStart, nameEnd));
    if (rawPath.endsWith("/")) {
      throw new DomainError("Archive directory entries are not supported");
    }
    const unixMode = (externalAttributes >>> 16) & 0xffff;
    const fileKind = unixMode & 0xf000;
    if (fileKind === 0xa000 || fileKind === 0x4000 || (externalAttributes & 0x10) !== 0) {
      throw new DomainError("Archive directory and link entries are not supported");
    }
    if ((flags & 1) !== 0) {
      throw new DomainError("Encrypted entries are not supported");
    }
    if (method !== 0 && method !== 8) {
      throw new DomainError("This archive uses an unsupported compression method");
    }
    const path = normalizedEntryPath(rawPath);
    if (entries.has(path)) throw new DomainError("duplicate archive path");

    if (readUint32(view, localOffset) !== LOCAL_FILE_HEADER) {
      throw damagedArchive();
    }
    const localFlags = readUint16(view, localOffset + 6);
    const localMethod = readUint16(view, localOffset + 8);
    const localNameLength = readUint16(view, localOffset + 26);
    const localExtraLength = readUint16(view, localOffset + 28);
    const localNameStart = localOffset + 30;
    const localNameEnd = localNameStart + localNameLength;
    const dataStart = localNameEnd + localExtraLength;
    if (
      (localFlags & 1) !== 0 ||
      localMethod !== method ||
      dataStart + compressedSize > centralOffset ||
      decodeEntryName(bytes.subarray(localNameStart, localNameEnd)) !== rawPath
    ) {
      throw damagedArchive();
    }

    expandedBytes += uncompressedSize;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new DomainError("This archive is too large");
    }
    if (path === "manifest.json" && uncompressedSize > MAX_MANIFEST_BYTES) {
      throw new DomainError("This archive manifest is too large");
    }
    entries.set(path, { path, compressedSize, uncompressedSize });
    offset = nameEnd + extraLength + entryCommentLength;
  }
  if (offset !== endOffset || !entries.has("manifest.json")) {
    throw damagedArchive();
  }
  return entries;
}

function shouldStore(contentType: string): boolean {
  return /^(?:image|audio|video)\//.test(contentType) ||
    /(?:^|\/)(?:zip|gzip|x-gzip|x-7z-compressed)$/.test(contentType);
}

export function encodeProjectArchive(
  input: ProjectArchiveManifestV1,
  payloads: Map<string, Uint8Array>,
): Uint8Array {
  const manifest = parseProjectArchiveManifest(input);
  const declarations = archivePayloads(manifest);
  const declaredPaths = new Set(declarations.map((entry) => entry.path));
  if (payloads.size !== declaredPaths.size) throw damagedArchive();
  const manifestBytes = strToU8(JSON.stringify(manifest));
  if (manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw new DomainError("This archive manifest is too large");
  }
  let expandedBytes = manifestBytes.byteLength;
  const zippable: Zippable = {
    "manifest.json": [manifestBytes, { level: 6, mtime: ZIP_EPOCH }],
  };
  const declarationByPath = new Map(
    declarations.map((entry) => [entry.path, entry]),
  );
  for (const path of [...payloads.keys()].sort()) {
    const declaration = declarationByPath.get(path);
    const bytes = payloads.get(path);
    if (!declaration || !bytes || bytes.byteLength !== declaration.sizeBytes) {
      throw damagedArchive();
    }
    expandedBytes += bytes.byteLength;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new DomainError("This archive is too large");
    }
    zippable[path] = [
      bytes,
      {
        level: shouldStore(declaration.contentType) ? 0 : 6,
        mtime: ZIP_EPOCH,
      },
    ];
  }
  const encoded = zipSync(zippable, { level: 6, mtime: ZIP_EPOCH });
  if (encoded.byteLength > MAX_ARCHIVE_BYTES) {
    throw new DomainError("This archive is too large");
  }
  return encoded;
}

export async function decodeProjectArchive(
  bytes: Uint8Array,
): Promise<DecodedProjectArchive> {
  const metadata = inspectZipHeaders(bytes);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(bytes);
  } catch {
    throw damagedArchive();
  }
  for (const [path, details] of metadata) {
    const entry = entries[path];
    if (!entry || entry.byteLength !== details.uncompressedSize) {
      throw damagedArchive();
    }
  }
  const manifestBytes = entries["manifest.json"];
  if (!manifestBytes || manifestBytes.byteLength > MAX_MANIFEST_BYTES) {
    throw damagedArchive();
  }
  let manifestInput: unknown;
  try {
    const json = new TextDecoder("utf-8", { fatal: true }).decode(
      manifestBytes,
    );
    manifestInput = JSON.parse(json);
  } catch {
    throw damagedArchive();
  }
  const manifest = parseProjectArchiveManifest(manifestInput);
  const payloads = new Map<string, Uint8Array>();
  for (const [path, entry] of Object.entries(entries)) {
    if (path !== "manifest.json") payloads.set(path, entry);
  }
  await validateArchivePayloads(manifest, payloads);
  return { manifest, payloads };
}
