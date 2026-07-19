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
  type WorkspaceMutation,
} from "./domain.ts";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new DomainError("Request body must be an object");
  }
  return value as JsonObject;
}

function rejectUnknown(value: JsonObject, allowed: string[]): void {
  const allowedSet = new Set(["action", ...allowed]);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length) {
    throw new DomainError(`unsupported field: ${unknown[0]}`);
  }
}

function id(value: unknown, label: string): string {
  return requireText(value, label, 100);
}

function estimate(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return validateMinorAmount(value);
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
        };
      }
      throw new DomainError("Item type must be task or event");
    }
    case "delete_item":
      rejectUnknown(value, ["itemId"]);
      return { action, itemId: id(value.itemId, "Item") };
    case "create_follow_up_task":
      rejectUnknown(value, [
        "sourceEventId",
        "collectionId",
        "title",
        "description",
        "status",
        "dueDate",
        "estimatedCostMinor",
      ]);
      return {
        action,
        sourceEventId: id(value.sourceEventId, "Source event"),
        collectionId: id(value.collectionId, "Collection"),
        title: requireText(value.title, "Task title", 160),
        description: optionalText(value.description),
        status: validateTaskStatus(value.status),
        dueDate: validateOptionalIsoDate(value.dueDate, "Due date"),
        estimatedCostMinor: estimate(value.estimatedCostMinor),
      };
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
