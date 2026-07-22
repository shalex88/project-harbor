export class DomainError extends Error {
  readonly code: "validation" | "forbidden" | "not_found" | "conflict";

  constructor(
    message: string,
    code: "validation" | "forbidden" | "not_found" | "conflict" =
      "validation",
  ) {
    super(message);
    this.name = "DomainError";
    this.code = code;
  }
}

export type TaskStatus = "todo" | "done";
export type ItemType = "task" | "event";
export type RelationType = "follows_from" | "blocks" | "related_to";
export type ProjectRole = "owner" | "member";

export type AppUser = {
  id: string;
  email: string;
  displayName: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  description: string;
  currency: string;
  ownerUserId: string;
  role: ProjectRole;
  createdAt: string;
  updatedAt: string;
};

export type MemberRecord = {
  projectId: string;
  userId: string;
  email: string;
  displayName: string;
  role: ProjectRole;
};

export type InvitationRecord = {
  id: string;
  projectId: string;
  email: string;
  status: "pending";
  createdAt: string;
};

export type CollectionRecord = {
  id: string;
  projectId: string;
  name: string;
  color: string;
  position: number;
  createdAt: string;
  updatedAt: string;
};

export type ItemFileRecord = {
  id: string;
  itemId: string;
  fileObjectId: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  pinned: boolean;
  uploadedBy: string;
  uploadedByName: string;
  createdAt: string;
};

export type PaymentRecord = {
  id: string;
  itemId: string;
  amountMinor: number;
  paidOn: string;
  note: string;
  createdBy: string;
  createdByName: string;
  receiptFileId: string | null;
  receiptFilename: string | null;
  createdAt: string;
  updatedAt: string;
};

type WorkItemBase = {
  id: string;
  projectId: string;
  collectionId: string;
  type: ItemType;
  title: string;
  description: string;
  estimatedCostMinor: number | null;
  actualSpendMinor: number;
  varianceMinor: number | null;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  files: ItemFileRecord[];
  payments: PaymentRecord[];
};

export type TaskRecord = WorkItemBase & {
  type: "task";
  status: TaskStatus;
  dueDate: string | null;
  occurrenceDate: null;
};

export type EventRecord = WorkItemBase & {
  type: "event";
  status: null;
  dueDate: null;
  occurrenceDate: string;
};

export type WorkItemRecord = TaskRecord | EventRecord;

export type WorkItemRelationRecord = {
  id: string;
  projectId: string;
  sourceItemId: string;
  targetItemId: string;
  type: RelationType;
  createdBy: string;
  createdAt: string;
};

export type WorkspaceSnapshot = {
  user: AppUser;
  projects: ProjectRecord[];
  members: MemberRecord[];
  invitations: InvitationRecord[];
  collections: CollectionRecord[];
  items: WorkItemRecord[];
  relations: WorkItemRelationRecord[];
  generatedAt: string;
};

export type WorkspaceMutationResult = {
  snapshot: WorkspaceSnapshot;
  createdItemId: string | null;
};

export type WorkspaceMutation =
  | {
      action: "create_project";
      name: string;
      description?: string;
      currency: string;
    }
  | {
      action: "update_project";
      projectId: string;
      name: string;
      description?: string;
    }
  | { action: "delete_project"; projectId: string }
  | { action: "invite_member"; projectId: string; email: string }
  | { action: "remove_member"; projectId: string; userId: string }
  | {
      action: "create_collection";
      projectId: string;
      name: string;
      color?: string;
    }
  | {
      action: "update_collection";
      collectionId: string;
      name: string;
      color?: string;
    }
  | {
      action: "reorder_collections";
      projectId: string;
      collectionIds: string[];
    }
  | { action: "delete_collection"; collectionId: string }
  | {
      action: "create_item";
      collectionId: string;
      type: "task";
      title: string;
      description?: string;
      status: TaskStatus;
      dueDate?: string | null;
      estimatedCostMinor?: number | null;
    }
  | {
      action: "create_item";
      collectionId: string;
      type: "event";
      title: string;
      description?: string;
      occurrenceDate: string;
      estimatedCostMinor?: number | null;
    }
  | {
      action: "update_item";
      itemId: string;
      type: "task";
      title: string;
      description?: string;
      status: TaskStatus;
      dueDate?: string | null;
      estimatedCostMinor?: number | null;
    }
  | {
      action: "update_item";
      itemId: string;
      type: "event";
      title: string;
      description?: string;
      occurrenceDate: string;
      estimatedCostMinor?: number | null;
    }
  | { action: "delete_item"; itemId: string }
  | {
      action: "create_follow_up_task";
      sourceEventId: string;
      collectionId: string;
      title: string;
      description?: string;
      status: TaskStatus;
      dueDate?: string | null;
      estimatedCostMinor?: number | null;
    }
  | {
      action: "create_relation";
      sourceItemId: string;
      targetItemId: string;
      relationType: RelationType;
    }
  | { action: "delete_relation"; relationId: string }
  | {
      action: "create_payment";
      itemId: string;
      amountMinor: number;
      paidOn: string;
      note?: string;
    }
  | {
      action: "update_payment";
      paymentId: string;
      amountMinor: number;
      paidOn: string;
      note?: string;
    }
  | { action: "delete_payment"; paymentId: string };

export function validateTaskStatus(value: unknown): TaskStatus {
  if (value === "todo" || value === "done") {
    return value;
  }
  throw new DomainError("invalid task status");
}

export function validateRelationType(value: unknown): RelationType {
  if (
    value === "follows_from" ||
    value === "blocks" ||
    value === "related_to"
  ) {
    return value;
  }
  throw new DomainError("invalid relationship type");
}

export function normalizeRelationEndpoints(
  type: RelationType,
  sourceItemId: string,
  targetItemId: string,
): { sourceItemId: string; targetItemId: string } {
  if (sourceItemId === targetItemId) {
    throw new DomainError("Cannot relate an item to itself");
  }
  if (type === "related_to" && sourceItemId > targetItemId) {
    return { sourceItemId: targetItemId, targetItemId: sourceItemId };
  }
  return { sourceItemId, targetItemId };
}

export function requireText(
  value: unknown,
  label: string,
  maxLength = 160,
): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new DomainError(`${label} is required`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new DomainError(`${label} must be ${maxLength} characters or less`);
  }
  return normalized;
}

export function optionalText(value: unknown, maxLength = 4_000): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") throw new DomainError("invalid text value");
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new DomainError(`text must be ${maxLength} characters or less`);
  }
  return normalized;
}

export function validateIsoDate(value: unknown, label: string): string {
  const parsed =
    typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      ? new Date(`${value}T00:00:00Z`)
      : null;
  if (
    !parsed ||
    Number.isNaN(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== value
  ) {
    throw new DomainError(`${label} must be a valid date`);
  }
  return value;
}

export function validateOptionalIsoDate(
  value: unknown,
  label: string,
): string | null {
  if (value === undefined || value === null || value === "") return null;
  return validateIsoDate(value, label);
}

export function validateCurrency(value: unknown): string {
  const supported = new Set([
    "USD",
    "EUR",
    "GBP",
    "ILS",
    "CAD",
    "AUD",
    "JPY",
  ]);
  if (typeof value !== "string" || !/^[A-Z]{3}$/.test(value)) {
    throw new DomainError("currency must be a three-letter ISO code");
  }
  if (!supported.has(value)) throw new DomainError("currency is not supported");
  return value;
}

export function validateMinorAmount(
  value: unknown,
  { positive = false }: { positive?: boolean } = {},
): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new DomainError("amount must use non-negative integer minor units");
  }
  if (positive && Number(value) <= 0) {
    throw new DomainError("payment amount must be positive");
  }
  return Number(value);
}

export function validateCollectionOrder(
  existingIds: string[],
  requestedIds: string[],
): string[] {
  const expected = new Set(existingIds);
  const requested = new Set(requestedIds);
  if (
    requestedIds.length !== expected.size ||
    requested.size !== expected.size ||
    requestedIds.some((id) => !expected.has(id))
  ) {
    throw new DomainError("Collection order does not match the project");
  }
  return requestedIds;
}

export function validateWorkspaceRoute(
  projects: Array<{ id: string }>,
  collections: Array<{ id: string; projectId: string }>,
  projectId?: string,
  collectionId?: string,
): { projectId: string | null; collectionId: string | null } {
  if (!projectId) return { projectId: null, collectionId: null };
  if (!projects.some((project) => project.id === projectId)) {
    throw new DomainError("Project not found", "not_found");
  }
  if (
    collectionId &&
    !collections.some(
      (collection) =>
        collection.id === collectionId && collection.projectId === projectId,
    )
  ) {
    throw new DomainError("Collection not found", "not_found");
  }
  return { projectId, collectionId: collectionId ?? null };
}

function currencyMinorDigits(currency: string): number {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).resolvedOptions().maximumFractionDigits ?? 2;
}

export function parseMoneyToMinor(
  value: string,
  currency = "USD",
): number | null {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) return null;
  const digits = currencyMinorDigits(currency);
  const pattern =
    digits === 0
      ? /^(\d+)$/
      : new RegExp(`^(\\d+)(?:\\.(\\d{1,${digits}}))?$`);
  const match = pattern.exec(normalized);
  if (!match) {
    throw new DomainError(
      digits === 0
        ? "enter a valid amount without decimals"
        : `enter a valid amount with up to ${digits} decimals`,
    );
  }
  const whole = Number(match[1]);
  const fraction = Number((match[2] ?? "").padEnd(digits, "0"));
  const factor = 10 ** digits;
  const minor = whole * factor + fraction;
  if (!Number.isSafeInteger(minor)) throw new DomainError("amount is too large");
  return minor;
}

export function formatMoney(amountMinor: number, currency: string): string {
  const digits = currencyMinorDigits(currency);
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
  }).format(amountMinor / 10 ** digits);
}

export function moneyInputValue(amountMinor: number, currency: string): string {
  const digits = currencyMinorDigits(currency);
  return (amountMinor / 10 ** digits).toFixed(digits);
}

export function summarizeItemMoney(
  estimatedMinor: number | null,
  payments: Array<{ amountMinor: number }>,
): {
  estimatedMinor: number | null;
  actualMinor: number;
  varianceMinor: number | null;
} {
  const actualMinor = payments.reduce(
    (sum, payment) => sum + payment.amountMinor,
    0,
  );
  return {
    estimatedMinor,
    actualMinor,
    varianceMinor:
      estimatedMinor === null ? null : actualMinor - estimatedMinor,
  };
}

export function summarizeSpending(
  values: Array<{
    currency: string;
    estimatedMinor: number | null;
    actualMinor: number;
  }>,
): Array<{
  currency: string;
  estimatedMinor: number;
  actualMinor: number;
  varianceMinor: number;
}> {
  const grouped = new Map<
    string,
    {
      estimatedMinor: number;
      actualMinor: number;
      comparableActualMinor: number;
    }
  >();
  for (const value of values) {
    const current = grouped.get(value.currency) ?? {
      estimatedMinor: 0,
      actualMinor: 0,
      comparableActualMinor: 0,
    };
    if (value.estimatedMinor !== null) {
      current.estimatedMinor += value.estimatedMinor;
      current.comparableActualMinor += value.actualMinor;
    }
    current.actualMinor += value.actualMinor;
    grouped.set(value.currency, current);
  }
  return [...grouped.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([currency, total]) => ({
      currency,
      estimatedMinor: total.estimatedMinor,
      actualMinor: total.actualMinor,
      varianceMinor: total.comparableActualMinor - total.estimatedMinor,
    }));
}

export function projectTimeline<
  T extends {
    id: string;
    type: ItemType;
    title: string;
    dueDate: string | null;
    occurrenceDate: string | null;
    status: TaskStatus | null;
  },
>(items: T[]): Array<T & { date: string }> {
  return items
    .flatMap((item) => {
      const date = item.type === "task" ? item.dueDate : item.occurrenceDate;
      return date ? [{ ...item, date }] : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}
