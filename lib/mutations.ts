import {
  DomainError,
  normalizeRelationEndpoints,
  optionalText,
  requireText,
  validateCurrency,
  validateIsoDate,
  validateMinorAmount,
  validateOptionalIsoDate,
  validateRelationType,
  validateTaskStatus,
  type ContactMentionInput,
  type WorkspaceMutation,
} from "./domain.ts";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("Request body must be an object");
  }
  return value as JsonObject;
}

function rejectUnknown(
  value: JsonObject,
  allowed: string[],
  includeAction = true,
): void {
  const allowedSet = new Set(includeAction ? ["action", ...allowed] : allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) {
    throw new DomainError(`unsupported field: ${unknown[0]}`);
  }
}

const WORK_ITEM_CONTACT_KEYS = ["manualContactIds", "contactMentions"];

function contactIdArray(value: unknown): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DomainError("Manual contacts must be an array");
  }
  const result = value.map((entry) => id(entry, "Contact"));
  if (new Set(result).size !== result.length) {
    throw new DomainError("Manual contacts must not contain duplicates");
  }
  return result;
}

function contactMentionArray(value: unknown): ContactMentionInput[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DomainError("Contact mentions must be an array");
  }
  return value.map((entry) => {
    const mention = asObject(entry);
    rejectUnknown(
      mention,
      ["contactId", "field", "startOffset", "endOffset"],
      false,
    );
    if (mention.field !== "title" && mention.field !== "description") {
      throw new DomainError(
        "Contact mention field must be title or description",
      );
    }
    if (
      !Number.isSafeInteger(mention.startOffset) ||
      !Number.isSafeInteger(mention.endOffset)
    ) {
      throw new DomainError("Contact mention offsets must be integers");
    }
    const startOffset = Number(mention.startOffset);
    const endOffset = Number(mention.endOffset);
    if (startOffset < 0 || endOffset <= startOffset) {
      throw new DomainError("Contact mention range is invalid");
    }
    return {
      contactId: id(mention.contactId, "Contact"),
      field: mention.field,
      startOffset,
      endOffset,
    };
  });
}

function workItemContactFields(value: JsonObject) {
  return {
    manualContactIds: contactIdArray(value.manualContactIds),
    contactMentions: contactMentionArray(value.contactMentions),
  };
}

function id(value: unknown, label: string): string {
  return requireText(value, label, 100);
}

function estimate(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return validateMinorAmount(value);
}

function contactFields(value: JsonObject) {
  return {
    name: requireText(value.name, "Contact name", 160),
    roleOrCompany: optionalText(value.roleOrCompany, 160, "Role or company"),
    email: optionalText(value.email, 254, "Email"),
    phone: optionalText(value.phone, 80, "Phone"),
    notes: optionalText(value.notes, 2_000, "Notes"),
  };
}

export function parseMutation(input: unknown): WorkspaceMutation {
  const value = asObject(input);
  const action = value.action;
  if (typeof action !== "string") throw new DomainError("action is required");

  switch (action) {
    case "create_project":
      rejectUnknown(value, ["name", "description", "currency"]);
      return {
        action,
        name: requireText(value.name, "Project name", 120),
        description: optionalText(value.description, 1_000),
        currency: validateCurrency(value.currency),
      };
    case "update_project":
      rejectUnknown(value, ["projectId", "name", "description"]);
      return {
        action,
        projectId: id(value.projectId, "Project"),
        name: requireText(value.name, "Project name", 120),
        description: optionalText(value.description, 1_000),
      };
    case "delete_project":
      rejectUnknown(value, ["projectId"]);
      return {
        action,
        projectId: id(value.projectId, "Project"),
      };
    case "invite_member":
      rejectUnknown(value, ["projectId", "email"]);
      return {
        action,
        projectId: id(value.projectId, "Project"),
        email: requireText(value.email, "Email", 254),
      };
    case "remove_member":
      rejectUnknown(value, ["projectId", "userId"]);
      return {
        action,
        projectId: id(value.projectId, "Project"),
        userId: id(value.userId, "Member"),
      };
    case "create_contact":
      rejectUnknown(value, [
        "projectId",
        "name",
        "roleOrCompany",
        "email",
        "phone",
        "notes",
      ]);
      return {
        action,
        projectId: id(value.projectId, "Project"),
        ...contactFields(value),
      };
    case "update_contact":
      rejectUnknown(value, [
        "contactId",
        "name",
        "roleOrCompany",
        "email",
        "phone",
        "notes",
      ]);
      return {
        action,
        contactId: id(value.contactId, "Contact"),
        ...contactFields(value),
      };
    case "delete_contact":
      rejectUnknown(value, ["contactId"]);
      return {
        action,
        contactId: id(value.contactId, "Contact"),
      };
    case "create_collection":
      rejectUnknown(value, ["projectId", "name", "color"]);
      return {
        action,
        projectId: id(value.projectId, "Project"),
        name: requireText(value.name, "Collection name", 80),
        color: optionalText(value.color, 24) || "cyan",
      };
    case "update_collection":
      rejectUnknown(value, ["collectionId", "name", "color"]);
      return {
        action,
        collectionId: id(value.collectionId, "Collection"),
        name: requireText(value.name, "Collection name", 80),
        color: optionalText(value.color, 24) || "cyan",
      };
    case "reorder_collections":
      rejectUnknown(value, ["projectId", "collectionIds"]);
      if (
        !Array.isArray(value.collectionIds) ||
        value.collectionIds.some((entry) => typeof entry !== "string")
      ) {
        throw new DomainError("Collection order is invalid");
      }
      return {
        action,
        projectId: id(value.projectId, "Project"),
        collectionIds: value.collectionIds,
      };
    case "delete_collection":
      rejectUnknown(value, ["collectionId"]);
      return {
        action,
        collectionId: id(value.collectionId, "Collection"),
      };
    case "create_item": {
      if (value.type === "task") {
        rejectUnknown(value, [
          "collectionId",
          "type",
          "title",
          "description",
          "status",
          "dueDate",
          "estimatedCostMinor",
          ...WORK_ITEM_CONTACT_KEYS,
        ]);
        return {
          action,
          collectionId: id(value.collectionId, "Collection"),
          type: "task",
          title: requireText(value.title, "Task title", 160),
          description: optionalText(value.description),
          status: validateTaskStatus(value.status),
          dueDate: validateOptionalIsoDate(value.dueDate, "Due date"),
          estimatedCostMinor: estimate(value.estimatedCostMinor),
          ...workItemContactFields(value),
        };
      }
      if (value.type === "event") {
        rejectUnknown(value, [
          "collectionId",
          "type",
          "title",
          "description",
          "occurrenceDate",
          "estimatedCostMinor",
          ...WORK_ITEM_CONTACT_KEYS,
        ]);
        return {
          action,
          collectionId: id(value.collectionId, "Collection"),
          type: "event",
          title: requireText(value.title, "Event title", 160),
          description: optionalText(value.description),
          occurrenceDate: validateIsoDate(
            value.occurrenceDate,
            "Occurrence date",
          ),
          estimatedCostMinor: estimate(value.estimatedCostMinor),
          ...workItemContactFields(value),
        };
      }
      throw new DomainError("Item type must be task or event");
    }
    case "update_item": {
      if (value.type === "task") {
        rejectUnknown(value, [
          "itemId",
          "type",
          "title",
          "description",
          "status",
          "dueDate",
          "estimatedCostMinor",
          ...WORK_ITEM_CONTACT_KEYS,
        ]);
        return {
          action,
          itemId: id(value.itemId, "Item"),
          type: "task",
          title: requireText(value.title, "Task title", 160),
          description: optionalText(value.description),
          status: validateTaskStatus(value.status),
          dueDate: validateOptionalIsoDate(value.dueDate, "Due date"),
          estimatedCostMinor: estimate(value.estimatedCostMinor),
          ...workItemContactFields(value),
        };
      }
      if (value.type === "event") {
        rejectUnknown(value, [
          "itemId",
          "type",
          "title",
          "description",
          "occurrenceDate",
          "estimatedCostMinor",
          ...WORK_ITEM_CONTACT_KEYS,
        ]);
        return {
          action,
          itemId: id(value.itemId, "Item"),
          type: "event",
          title: requireText(value.title, "Event title", 160),
          description: optionalText(value.description),
          occurrenceDate: validateIsoDate(
            value.occurrenceDate,
            "Occurrence date",
          ),
          estimatedCostMinor: estimate(value.estimatedCostMinor),
          ...workItemContactFields(value),
        };
      }
      throw new DomainError("Item type must be task or event");
    }
    case "delete_item":
      rejectUnknown(value, ["itemId"]);
      return { action, itemId: id(value.itemId, "Item") };
    case "create_follow_up_item": {
      if (value.type === "task") {
        rejectUnknown(value, [
          "sourceItemId",
          "collectionId",
          "type",
          "title",
          "description",
          "status",
          "dueDate",
          "estimatedCostMinor",
          ...WORK_ITEM_CONTACT_KEYS,
        ]);
        return {
          action,
          sourceItemId: id(value.sourceItemId, "Source item"),
          collectionId: id(value.collectionId, "Collection"),
          type: "task",
          title: requireText(value.title, "Task title", 160),
          description: optionalText(value.description),
          status: validateTaskStatus(value.status),
          dueDate: validateOptionalIsoDate(value.dueDate, "Due date"),
          estimatedCostMinor: estimate(value.estimatedCostMinor),
          ...workItemContactFields(value),
        };
      }
      if (value.type === "event") {
        rejectUnknown(value, [
          "sourceItemId",
          "collectionId",
          "type",
          "title",
          "description",
          "occurrenceDate",
          "estimatedCostMinor",
          ...WORK_ITEM_CONTACT_KEYS,
        ]);
        return {
          action,
          sourceItemId: id(value.sourceItemId, "Source item"),
          collectionId: id(value.collectionId, "Collection"),
          type: "event",
          title: requireText(value.title, "Event title", 160),
          description: optionalText(value.description),
          occurrenceDate: validateIsoDate(
            value.occurrenceDate,
            "Occurrence date",
          ),
          estimatedCostMinor: estimate(value.estimatedCostMinor),
          ...workItemContactFields(value),
        };
      }
      throw new DomainError("Item type must be task or event");
    }
    case "create_relation": {
      rejectUnknown(value, [
        "sourceItemId",
        "targetItemId",
        "relationType",
      ]);
      const relationType = validateRelationType(value.relationType);
      const endpoints = normalizeRelationEndpoints(
        relationType,
        id(value.sourceItemId, "Source item"),
        id(value.targetItemId, "Target item"),
      );
      return { action, relationType, ...endpoints };
    }
    case "delete_relation":
      rejectUnknown(value, ["relationId"]);
      return { action, relationId: id(value.relationId, "Relationship") };
    case "create_payment":
      rejectUnknown(value, ["itemId", "amountMinor", "paidOn", "note"]);
      return {
        action,
        itemId: id(value.itemId, "Item"),
        amountMinor: validateMinorAmount(value.amountMinor, { positive: true }),
        paidOn: validateIsoDate(value.paidOn, "Payment date"),
        note: optionalText(value.note, 500),
      };
    case "update_payment":
      rejectUnknown(value, ["paymentId", "amountMinor", "paidOn", "note"]);
      return {
        action,
        paymentId: id(value.paymentId, "Payment"),
        amountMinor: validateMinorAmount(value.amountMinor, { positive: true }),
        paidOn: validateIsoDate(value.paidOn, "Payment date"),
        note: optionalText(value.note, 500),
      };
    case "delete_payment":
      rejectUnknown(value, ["paymentId"]);
      return { action, paymentId: id(value.paymentId, "Payment") };
    default:
      throw new DomainError(`unknown action: ${action}`);
  }
}
