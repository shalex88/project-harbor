import {
  DomainError,
  optionalText,
  requireText,
  validateCurrency,
  validateIsoDate,
  validateMinorAmount,
  validateOptionalIsoDate,
  validateRelationType,
  validateTaskStatus,
  type RelationType,
  type TaskStatus,
} from "./domain.ts";
import { validateUpload } from "./upload-policy.ts";

export const PROJECT_ARCHIVE_FORMAT = "project-harbor-project" as const;
export const PROJECT_ARCHIVE_VERSION = 1 as const;
export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024;
export const MAX_EXPANDED_BYTES = 100 * 1024 * 1024;
export const MAX_ARCHIVE_ENTRIES = 1_000;
export const MAX_MANIFEST_BYTES = 2 * 1024 * 1024;
export const ARCHIVE_COLORS = ["cyan", "seafoam", "violet", "amber"] as const;

type ArchiveColor = (typeof ARCHIVE_COLORS)[number];
type JsonObject = Record<string, unknown>;

export type ProjectArchiveCollection = {
  id: string;
  name: string;
  color: ArchiveColor;
  position: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectArchiveItemBase = {
  id: string;
  collectionId: string;
  title: string;
  description: string;
  estimatedCostMinor: number | null;
  creatorLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectArchiveTask = ProjectArchiveItemBase & {
  type: "task";
  status: TaskStatus;
  dueDate: string | null;
};

export type ProjectArchiveEvent = ProjectArchiveItemBase & {
  type: "event";
  occurrenceDate: string;
};

export type ProjectArchiveItem = ProjectArchiveTask | ProjectArchiveEvent;

export type ProjectArchiveRelation = {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  type: RelationType;
  createdAt: string;
};

export type ProjectArchivePayment = {
  id: string;
  itemId: string;
  amountMinor: number;
  paidOn: string;
  note: string;
  creatorLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectArchiveAttachment = {
  id: string;
  itemId: string;
  path: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  pinned: boolean;
  position: number;
  uploaderLabel: string | null;
  createdAt: string;
};

export type ProjectArchiveReceipt = {
  id: string;
  paymentId: string;
  path: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  uploaderLabel: string | null;
  createdAt: string;
};

export type ProjectArchiveManifestV1 = {
  format: typeof PROJECT_ARCHIVE_FORMAT;
  version: typeof PROJECT_ARCHIVE_VERSION;
  exportedAt: string;
  project: {
    name: string;
    description: string;
    currency: string;
  };
  collections: ProjectArchiveCollection[];
  items: ProjectArchiveItem[];
  relations: ProjectArchiveRelation[];
  payments: ProjectArchivePayment[];
  attachments: ProjectArchiveAttachment[];
  receipts: ProjectArchiveReceipt[];
};

export type ProjectArchivePayload =
  | ProjectArchiveAttachment
  | ProjectArchiveReceipt;

function asObject(value: unknown, label: string): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError(`${label} must be an object`);
  }
  return value as JsonObject;
}

function asArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new DomainError(`${label} must be an array`);
  }
  return value;
}

function rejectUnknown(
  value: JsonObject,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedSet.has(key));
  if (unknown) throw new DomainError(`unsupported field: ${unknown}`);
}

function archiveId(value: unknown, label: string): string {
  return requireText(value, label, 100);
}

function nonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new DomainError(`${label} must be a non-negative integer`);
  }
  return Number(value);
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) {
    throw new DomainError(`${label} must be a positive integer`);
  }
  return Number(value);
}

function isoTimestamp(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new DomainError(`${label} must be a valid timestamp`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) {
    throw new DomainError(`${label} must be a valid timestamp`);
  }
  return value;
}

function attribution(value: unknown, label: string): string | null {
  if (value === null || value === undefined || value === "") return null;
  return requireText(value, label, 160);
}

function nullableEstimate(value: unknown): number | null {
  if (value === null) return null;
  return validateMinorAmount(value);
}

function archiveColor(value: unknown): ArchiveColor {
  if (
    typeof value !== "string" ||
    !ARCHIVE_COLORS.includes(value as ArchiveColor)
  ) {
    throw new DomainError("collection color is not supported");
  }
  return value as ArchiveColor;
}

function payloadPath(value: unknown, root: "attachments" | "receipts"): string {
  if (
    typeof value !== "string" ||
    value.length > 240 ||
    value.startsWith("/") ||
    value.includes("\\") ||
    value.includes("//") ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    throw new DomainError("unsafe archive path");
  }
  const segments = value.split("/");
  if (
    segments.length !== 2 ||
    segments[0] !== root ||
    !segments[1] ||
    segments.some((segment) => segment === "." || segment === "..")
  ) {
    throw new DomainError("unsafe archive path");
  }
  return value;
}

function checksum(value: unknown): string {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/.test(value)) {
    throw new DomainError("file checksum must be lowercase SHA-256");
  }
  return value;
}

function parseCollection(input: unknown): ProjectArchiveCollection {
  const value = asObject(input, "collection");
  rejectUnknown(value, [
    "id",
    "name",
    "color",
    "position",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: archiveId(value.id, "Collection id"),
    name: requireText(value.name, "Collection name", 80),
    color: archiveColor(value.color),
    position: nonNegativeInteger(value.position, "Collection position"),
    createdAt: isoTimestamp(value.createdAt, "Collection creation time"),
    updatedAt: isoTimestamp(value.updatedAt, "Collection update time"),
  };
}

function parseItem(input: unknown): ProjectArchiveItem {
  const value = asObject(input, "item");
  const baseAllowed = [
    "id",
    "collectionId",
    "type",
    "title",
    "description",
    "estimatedCostMinor",
    "creatorLabel",
    "createdAt",
    "updatedAt",
  ];
  const base = {
    id: archiveId(value.id, "Item id"),
    collectionId: archiveId(value.collectionId, "Item collection"),
    title: requireText(value.title, "Item title", 160),
    description: optionalText(value.description),
    estimatedCostMinor: nullableEstimate(value.estimatedCostMinor),
    creatorLabel: attribution(value.creatorLabel, "Creator label"),
    createdAt: isoTimestamp(value.createdAt, "Item creation time"),
    updatedAt: isoTimestamp(value.updatedAt, "Item update time"),
  };

  if (value.type === "task") {
    rejectUnknown(value, [...baseAllowed, "status", "dueDate"]);
    return {
      ...base,
      type: "task",
      status: validateTaskStatus(value.status),
      dueDate: validateOptionalIsoDate(value.dueDate, "Due date"),
    };
  }
  if (value.type === "event") {
    rejectUnknown(value, [...baseAllowed, "occurrenceDate"]);
    return {
      ...base,
      type: "event",
      occurrenceDate: validateIsoDate(value.occurrenceDate, "Occurrence date"),
    };
  }
  throw new DomainError("Item type must be task or event");
}

function parseRelation(input: unknown): ProjectArchiveRelation {
  const value = asObject(input, "relationship");
  rejectUnknown(value, [
    "id",
    "sourceItemId",
    "targetItemId",
    "type",
    "createdAt",
  ]);
  return {
    id: archiveId(value.id, "Relationship id"),
    sourceItemId: archiveId(value.sourceItemId, "Source item"),
    targetItemId: archiveId(value.targetItemId, "Target item"),
    type: validateRelationType(value.type),
    createdAt: isoTimestamp(value.createdAt, "Relationship creation time"),
  };
}

function parsePayment(input: unknown): ProjectArchivePayment {
  const value = asObject(input, "payment");
  rejectUnknown(value, [
    "id",
    "itemId",
    "amountMinor",
    "paidOn",
    "note",
    "creatorLabel",
    "createdAt",
    "updatedAt",
  ]);
  return {
    id: archiveId(value.id, "Payment id"),
    itemId: archiveId(value.itemId, "Payment item"),
    amountMinor: validateMinorAmount(value.amountMinor, { positive: true }),
    paidOn: validateIsoDate(value.paidOn, "Payment date"),
    note: optionalText(value.note, 500),
    creatorLabel: attribution(value.creatorLabel, "Creator label"),
    createdAt: isoTimestamp(value.createdAt, "Payment creation time"),
    updatedAt: isoTimestamp(value.updatedAt, "Payment update time"),
  };
}

function parseAttachment(input: unknown): ProjectArchiveAttachment {
  const value = asObject(input, "attachment");
  rejectUnknown(value, [
    "id",
    "itemId",
    "path",
    "filename",
    "contentType",
    "sizeBytes",
    "sha256",
    "pinned",
    "position",
    "uploaderLabel",
    "createdAt",
  ]);
  const id = archiveId(value.id, "Attachment id");
  const sizeBytes = positiveInteger(value.sizeBytes, "Attachment size");
  const policy = validateUpload(
    {
      name: requireText(value.filename, "Attachment filename", 160),
      type: requireText(value.contentType, "Attachment content type", 160),
      size: sizeBytes,
    },
    "item",
  );
  if (typeof value.pinned !== "boolean") {
    throw new DomainError("Attachment pinned state must be boolean");
  }
  return {
    id,
    itemId: archiveId(value.itemId, "Attachment item"),
    path: payloadPath(value.path, "attachments"),
    filename: policy.filename,
    contentType: policy.contentType,
    sizeBytes: policy.sizeBytes,
    sha256: checksum(value.sha256),
    pinned: value.pinned,
    position: nonNegativeInteger(value.position, "Attachment position"),
    uploaderLabel: attribution(value.uploaderLabel, "Uploader label"),
    createdAt: isoTimestamp(value.createdAt, "Attachment creation time"),
  };
}

function parseReceipt(input: unknown): ProjectArchiveReceipt {
  const value = asObject(input, "receipt");
  rejectUnknown(value, [
    "id",
    "paymentId",
    "path",
    "filename",
    "contentType",
    "sizeBytes",
    "sha256",
    "uploaderLabel",
    "createdAt",
  ]);
  const id = archiveId(value.id, "Receipt id");
  const sizeBytes = positiveInteger(value.sizeBytes, "Receipt size");
  const policy = validateUpload(
    {
      name: requireText(value.filename, "Receipt filename", 160),
      type: requireText(value.contentType, "Receipt content type", 160),
      size: sizeBytes,
    },
    "receipt",
  );
  return {
    id,
    paymentId: archiveId(value.paymentId, "Receipt payment"),
    path: payloadPath(value.path, "receipts"),
    filename: policy.filename,
    contentType: policy.contentType,
    sizeBytes: policy.sizeBytes,
    sha256: checksum(value.sha256),
    uploaderLabel: attribution(value.uploaderLabel, "Uploader label"),
    createdAt: isoTimestamp(value.createdAt, "Receipt creation time"),
  };
}

function uniqueIds(
  label: string,
  records: Array<{ id: string }>,
): Set<string> {
  const ids = new Set<string>();
  for (const record of records) {
    if (ids.has(record.id)) throw new DomainError(`duplicate ${label} id`);
    ids.add(record.id);
  }
  return ids;
}

function validateDirectedAcyclic(
  relations: ProjectArchiveRelation[],
  type: Exclude<RelationType, "related_to">,
): void {
  const outgoing = new Map<string, string[]>();
  for (const relation of relations) {
    if (relation.type !== type) continue;
    outgoing.set(relation.sourceItemId, [
      ...(outgoing.get(relation.sourceItemId) ?? []),
      relation.targetItemId,
    ]);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (itemId: string): void => {
    if (visiting.has(itemId)) {
      throw new DomainError("Relationship would create a cycle");
    }
    if (visited.has(itemId)) return;
    visiting.add(itemId);
    for (const target of outgoing.get(itemId) ?? []) visit(target);
    visiting.delete(itemId);
    visited.add(itemId);
  };
  for (const itemId of outgoing.keys()) visit(itemId);
}

function validateReferences(manifest: ProjectArchiveManifestV1): void {
  const collectionIds = uniqueIds("collection", manifest.collections);
  const itemIds = uniqueIds("item", manifest.items);
  const relationIds = uniqueIds("relationship", manifest.relations);
  const paymentIds = uniqueIds("payment", manifest.payments);
  const attachmentIds = uniqueIds("attachment", manifest.attachments);
  const receiptIds = uniqueIds("receipt", manifest.receipts);
  void relationIds;
  void attachmentIds;
  void receiptIds;

  for (const item of manifest.items) {
    if (!collectionIds.has(item.collectionId)) {
      throw new DomainError("Item has an unknown collection reference");
    }
  }
  const itemById = new Map(manifest.items.map((item) => [item.id, item]));
  const relationMeanings = new Set<string>();
  for (const relation of manifest.relations) {
    const source = itemById.get(relation.sourceItemId);
    const target = itemById.get(relation.targetItemId);
    if (!source || !target) {
      throw new DomainError("Relationship has an unknown item reference");
    }
    if (source.id === target.id) {
      throw new DomainError("Cannot relate an item to itself");
    }
    if (
      relation.type === "related_to" &&
      relation.sourceItemId > relation.targetItemId
    ) {
      throw new DomainError(
        "Related items must use canonical endpoint order",
      );
    }
    if (
      relation.type === "blocks" &&
      (source.type !== "task" || target.type !== "task")
    ) {
      throw new DomainError("Blocking relationships require two tasks");
    }
    const meaning = `${relation.type}\0${relation.sourceItemId}\0${relation.targetItemId}`;
    if (relationMeanings.has(meaning)) {
      throw new DomainError("duplicate relationship");
    }
    relationMeanings.add(meaning);
  }
  validateDirectedAcyclic(manifest.relations, "blocks");
  validateDirectedAcyclic(manifest.relations, "follows_from");

  for (const payment of manifest.payments) {
    if (!itemIds.has(payment.itemId)) {
      throw new DomainError("Payment has an unknown item reference");
    }
  }
  const paths = new Set<string>();
  for (const attachment of manifest.attachments) {
    if (!itemIds.has(attachment.itemId)) {
      throw new DomainError("Attachment has an unknown item reference");
    }
    if (paths.has(attachment.path)) {
      throw new DomainError("duplicate archive path");
    }
    paths.add(attachment.path);
  }
  const receiptPayments = new Set<string>();
  for (const receipt of manifest.receipts) {
    if (!paymentIds.has(receipt.paymentId)) {
      throw new DomainError("Receipt has an unknown payment reference");
    }
    if (receiptPayments.has(receipt.paymentId)) {
      throw new DomainError("duplicate receipt for payment");
    }
    if (paths.has(receipt.path)) {
      throw new DomainError("duplicate archive path");
    }
    receiptPayments.add(receipt.paymentId);
    paths.add(receipt.path);
  }
}

export function parseProjectArchiveManifest(
  input: unknown,
): ProjectArchiveManifestV1 {
  const value = asObject(input, "Archive manifest");
  rejectUnknown(value, [
    "format",
    "version",
    "exportedAt",
    "project",
    "collections",
    "items",
    "relations",
    "payments",
    "attachments",
    "receipts",
  ]);
  if (value.format !== PROJECT_ARCHIVE_FORMAT) {
    throw new DomainError("This is not a Project Harbor archive");
  }
  if (value.version !== PROJECT_ARCHIVE_VERSION) {
    throw new DomainError("This archive version is not supported");
  }
  const project = asObject(value.project, "Project");
  rejectUnknown(project, ["name", "description", "currency"]);
  const attachments = asArray(value.attachments, "Attachments").map(
    parseAttachment,
  );
  const receipts = asArray(value.receipts, "Receipts").map(parseReceipt);
  if (attachments.length + receipts.length + 1 > MAX_ARCHIVE_ENTRIES) {
    throw new DomainError("This archive contains too many files");
  }
  const manifest: ProjectArchiveManifestV1 = {
    format: PROJECT_ARCHIVE_FORMAT,
    version: PROJECT_ARCHIVE_VERSION,
    exportedAt: isoTimestamp(value.exportedAt, "Export time"),
    project: {
      name: requireText(project.name, "Project name", 120),
      description: optionalText(project.description, 1_000),
      currency: validateCurrency(project.currency),
    },
    collections: asArray(value.collections, "Collections").map(
      parseCollection,
    ),
    items: asArray(value.items, "Items").map(parseItem),
    relations: asArray(value.relations, "Relationships").map(parseRelation),
    payments: asArray(value.payments, "Payments").map(parsePayment),
    attachments,
    receipts,
  };
  validateReferences(manifest);
  return manifest;
}

export function archivePayloads(
  manifest: ProjectArchiveManifestV1,
): ProjectArchivePayload[] {
  return [...manifest.attachments, ...manifest.receipts];
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function equalChecksum(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function validateArchivePayloads(
  manifest: ProjectArchiveManifestV1,
  payloads: Map<string, Uint8Array>,
): Promise<void> {
  const declarations = archivePayloads(manifest);
  const declaredPaths = new Set(declarations.map((entry) => entry.path));
  for (const path of payloads.keys()) {
    if (!declaredPaths.has(path)) {
      throw new DomainError("Unexpected archive entry");
    }
  }
  let expandedBytes = 0;
  for (const declaration of declarations) {
    const bytes = payloads.get(declaration.path);
    if (!bytes) {
      throw new DomainError("This archive is damaged or incomplete");
    }
    if (!(bytes instanceof Uint8Array)) {
      throw new DomainError("This archive is damaged or incomplete");
    }
    expandedBytes += bytes.byteLength;
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new DomainError("This archive is too large");
    }
    if (bytes.byteLength !== declaration.sizeBytes) {
      throw new DomainError("An archived file failed its integrity check");
    }
    const kind = "paymentId" in declaration ? "receipt" : "item";
    validateUpload(
      {
        name: declaration.filename,
        type: declaration.contentType,
        size: bytes.byteLength,
      },
      kind,
    );
    const actualChecksum = await sha256Hex(bytes);
    if (!equalChecksum(actualChecksum, declaration.sha256)) {
      throw new DomainError("An archived file failed its integrity check");
    }
  }
}

export function projectArchiveFilename(name: string): string {
  const stem = name
    .normalize("NFKC")
    .replace(/[\\/\u0000-\u001f\u007f:*?"<>|]+/g, " ")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "")
    .slice(0, 80);
  return `${stem || "project"}.harbor.zip`;
}
