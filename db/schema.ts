import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

const timestamps = {
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
};

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    displayName: text("display_name").notNull(),
    ...timestamps,
  },
  (table) => [uniqueIndex("users_email_unique").on(table.email)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    description: text("description").notNull().default(""),
    currency: text("currency").notNull(),
    ...timestamps,
  },
  (table) => [index("projects_owner_idx").on(table.ownerUserId)],
);

export const projectMembers = sqliteTable(
  "project_members",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id),
    role: text("role").notNull(),
    joinedAt: text("joined_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    primaryKey({ columns: [table.projectId, table.userId] }),
    index("project_members_user_idx").on(table.userId),
    check("project_members_role_check", sql`${table.role} IN ('owner', 'member')`),
  ],
);

export const projectInvitations = sqliteTable(
  "project_invitations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id),
    status: text("status").notNull().default("pending"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    acceptedAt: text("accepted_at"),
  },
  (table) => [
    uniqueIndex("project_invitations_project_email_unique").on(
      table.projectId,
      table.email,
    ),
    index("project_invitations_email_idx").on(table.email, table.status),
    check(
      "project_invitations_status_check",
      sql`${table.status} IN ('pending', 'accepted')`,
    ),
  ],
);

export const collections = sqliteTable(
  "collections",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    color: text("color").notNull().default("cyan"),
    position: integer("position").notNull().default(0),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("collections_id_project_unique").on(table.id, table.projectId),
    index("collections_project_position_idx").on(
      table.projectId,
      table.position,
    ),
  ],
);

export const workItems = sqliteTable(
  "work_items",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    collectionId: text("collection_id").notNull(),
    type: text("type").notNull(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    status: text("status"),
    dueDate: text("due_date"),
    occurrenceDate: text("occurrence_date"),
    estimatedCostMinor: integer("estimated_cost_minor"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    importedCreatorLabel: text("imported_creator_label"),
    ...timestamps,
  },
  (table) => [
    uniqueIndex("work_items_id_project_unique").on(table.id, table.projectId),
    index("work_items_project_idx").on(table.projectId),
    index("work_items_collection_idx").on(table.collectionId),
    index("work_items_task_filter_idx").on(
      table.projectId,
      table.type,
      table.status,
      table.dueDate,
    ),
    index("work_items_event_date_idx").on(
      table.projectId,
      table.type,
      table.occurrenceDate,
    ),
    check("work_items_type_check", sql`${table.type} IN ('task', 'event')`),
    check(
      "work_items_status_check",
      sql`${table.status} IS NULL OR ${table.status} IN ('todo', 'done')`,
    ),
    check(
      "work_items_type_fields_check",
      sql`(${table.type} = 'task' AND ${table.status} IS NOT NULL AND ${table.occurrenceDate} IS NULL) OR (${table.type} = 'event' AND ${table.status} IS NULL AND ${table.dueDate} IS NULL AND ${table.occurrenceDate} IS NOT NULL)`,
    ),
    check(
      "work_items_estimated_cost_check",
      sql`${table.estimatedCostMinor} IS NULL OR ${table.estimatedCostMinor} >= 0`,
    ),
    foreignKey({
      columns: [table.collectionId, table.projectId],
      foreignColumns: [collections.id, collections.projectId],
      name: "work_items_collection_project_fk",
    }).onDelete("cascade"),
  ],
);

export const workItemRelations = sqliteTable(
  "work_item_relations",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    sourceItemId: text("source_item_id").notNull(),
    targetItemId: text("target_item_id").notNull(),
    type: text("type").notNull(),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("work_item_relations_unique").on(
      table.projectId,
      table.type,
      table.sourceItemId,
      table.targetItemId,
    ),
    index("work_item_relations_source_idx").on(
      table.projectId,
      table.sourceItemId,
    ),
    index("work_item_relations_target_idx").on(
      table.projectId,
      table.targetItemId,
    ),
    foreignKey({
      columns: [table.sourceItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_relations_source_project_fk",
    }).onDelete("cascade"),
    foreignKey({
      columns: [table.targetItemId, table.projectId],
      foreignColumns: [workItems.id, workItems.projectId],
      name: "work_item_relations_target_project_fk",
    }).onDelete("cascade"),
    check(
      "work_item_relations_type_check",
      sql`${table.type} IN ('follows_from', 'blocks', 'related_to')`,
    ),
    check(
      "work_item_relations_distinct_items_check",
      sql`${table.sourceItemId} <> ${table.targetItemId}`,
    ),
    check(
      "work_item_relations_related_order_check",
      sql`${table.type} <> 'related_to' OR ${table.sourceItemId} < ${table.targetItemId}`,
    ),
  ],
);

export const fileObjects = sqliteTable(
  "file_objects",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    r2Key: text("r2_key").notNull(),
    filename: text("filename").notNull(),
    contentType: text("content_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    uploadedBy: text("uploaded_by")
      .notNull()
      .references(() => users.id),
    importedUploaderLabel: text("imported_uploader_label"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("file_objects_r2_key_unique").on(table.r2Key),
    index("file_objects_project_idx").on(table.projectId),
  ],
);

export const itemFiles = sqliteTable(
  "item_files",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    fileObjectId: text("file_object_id")
      .notNull()
      .references(() => fileObjects.id, { onDelete: "cascade" }),
    pinned: integer("pinned", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("item_files_file_unique").on(table.fileObjectId),
    index("item_files_item_idx").on(table.itemId, table.pinned, table.position),
  ],
);

export const payments = sqliteTable(
  "payments",
  {
    id: text("id").primaryKey(),
    itemId: text("item_id")
      .notNull()
      .references(() => workItems.id, { onDelete: "cascade" }),
    amountMinor: integer("amount_minor").notNull(),
    paidOn: text("paid_on").notNull(),
    note: text("note").notNull().default(""),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id),
    importedCreatorLabel: text("imported_creator_label"),
    ...timestamps,
  },
  (table) => [
    index("payments_item_date_idx").on(table.itemId, table.paidOn),
    index("payments_creator_idx").on(table.createdBy),
    check("payments_positive_amount_check", sql`${table.amountMinor} > 0`),
  ],
);

export const paymentReceipts = sqliteTable(
  "payment_receipts",
  {
    paymentId: text("payment_id")
      .primaryKey()
      .references(() => payments.id, { onDelete: "cascade" }),
    fileObjectId: text("file_object_id")
      .notNull()
      .references(() => fileObjects.id, { onDelete: "cascade" }),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("payment_receipts_file_unique").on(table.fileObjectId),
  ],
);
