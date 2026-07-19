import { getRawD1 } from "@/db";
import {
  DomainError,
  normalizeRelationEndpoints,
  optionalText,
  requireText,
  summarizeItemMoney,
  validateCollectionOrder,
  validateCurrency,
  validateIsoDate,
  validateMinorAmount,
  validateOptionalIsoDate,
  validateRelationType,
  validateTaskStatus,
  type AppUser,
  type CollectionRecord,
  type InvitationRecord,
  type ItemFileRecord,
  type MemberRecord,
  type PaymentRecord,
  type ProjectRecord,
  type ProjectRole,
  type RelationType,
  type WorkItemRecord,
  type WorkItemRelationRecord,
  type WorkspaceMutation,
  type WorkspaceMutationResult,
  type WorkspaceSnapshot,
} from "./domain";
import { canManagePayment, normalizeEmail } from "./authorization";
import type { IdentityUser } from "./auth";
import {
  DIRECTED_RELATION_INSERT_SQL,
  directedRelationInsertParams,
  isRelationUniqueConstraint,
} from "./relation-persistence";

type ProjectAccess = { projectId: string; userId: string; role: ProjectRole };

const PREVIEW_SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY NOT NULL, email TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
  `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY NOT NULL, owner_user_id TEXT NOT NULL, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', currency TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (owner_user_id) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS project_members (project_id TEXT NOT NULL, user_id TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('owner','member')), joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(project_id,user_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(user_id) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS project_invitations (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, email TEXT NOT NULL, invited_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted')), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, accepted_at TEXT, UNIQUE(project_id,email), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(invited_by) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS collections (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, name TEXT NOT NULL, color TEXT NOT NULL DEFAULT 'cyan', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(id,project_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS work_items (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, collection_id TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('task','event')), title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT CHECK(status IS NULL OR status IN ('todo','in_progress','done')), due_date TEXT, occurrence_date TEXT, estimated_cost_minor INTEGER CHECK(estimated_cost_minor IS NULL OR estimated_cost_minor >= 0), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK((type='task' AND status IS NOT NULL AND occurrence_date IS NULL) OR (type='event' AND status IS NULL AND due_date IS NULL AND occurrence_date IS NOT NULL)), UNIQUE(id,project_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(collection_id,project_id) REFERENCES collections(id,project_id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id))`,
  `CREATE UNIQUE INDEX IF NOT EXISTS work_items_id_project_unique ON work_items(id,project_id)`,
  `CREATE TABLE IF NOT EXISTS work_item_relations (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, source_item_id TEXT NOT NULL, target_item_id TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('follows_from','blocks','related_to')), created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, CHECK(source_item_id <> target_item_id), CHECK(type <> 'related_to' OR source_item_id < target_item_id), UNIQUE(project_id,type,source_item_id,target_item_id), FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(source_item_id,project_id) REFERENCES work_items(id,project_id) ON DELETE CASCADE, FOREIGN KEY(target_item_id,project_id) REFERENCES work_items(id,project_id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS file_objects (id TEXT PRIMARY KEY NOT NULL, project_id TEXT NOT NULL, r2_key TEXT NOT NULL UNIQUE, filename TEXT NOT NULL, content_type TEXT NOT NULL, size_bytes INTEGER NOT NULL, uploaded_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE, FOREIGN KEY(uploaded_by) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS item_files (id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, file_object_id TEXT NOT NULL UNIQUE, pinned INTEGER NOT NULL DEFAULT 0, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(item_id) REFERENCES work_items(id) ON DELETE CASCADE, FOREIGN KEY(file_object_id) REFERENCES file_objects(id) ON DELETE CASCADE)`,
  `CREATE TABLE IF NOT EXISTS payments (id TEXT PRIMARY KEY NOT NULL, item_id TEXT NOT NULL, amount_minor INTEGER NOT NULL CHECK(amount_minor > 0), paid_on TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(item_id) REFERENCES work_items(id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id))`,
  `CREATE TABLE IF NOT EXISTS payment_receipts (payment_id TEXT PRIMARY KEY NOT NULL, file_object_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY(payment_id) REFERENCES payments(id) ON DELETE CASCADE, FOREIGN KEY(file_object_id) REFERENCES file_objects(id) ON DELETE CASCADE)`,
  `CREATE INDEX IF NOT EXISTS project_members_user_idx ON project_members(user_id)`,
  `CREATE INDEX IF NOT EXISTS project_invitations_email_idx ON project_invitations(email,status)`,
  `CREATE INDEX IF NOT EXISTS collections_project_position_idx ON collections(project_id,position)`,
  `CREATE INDEX IF NOT EXISTS work_items_collection_idx ON work_items(collection_id)`,
  `CREATE INDEX IF NOT EXISTS work_items_task_filter_idx ON work_items(project_id,type,status,due_date)`,
  `CREATE INDEX IF NOT EXISTS work_items_event_date_idx ON work_items(project_id,type,occurrence_date)`,
  `CREATE INDEX IF NOT EXISTS work_item_relations_source_idx ON work_item_relations(project_id,source_item_id)`,
  `CREATE INDEX IF NOT EXISTS work_item_relations_target_idx ON work_item_relations(project_id,target_item_id)`,
  `CREATE INDEX IF NOT EXISTS item_files_item_idx ON item_files(item_id,pinned,position)`,
  `CREATE INDEX IF NOT EXISTS payments_item_date_idx ON payments(item_id,paid_on)`,
];

async function ensurePreviewSchema(): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const db = getRawD1();
  await db.batch(PREVIEW_SCHEMA.map((statement) => db.prepare(statement)));
}

async function first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  return (await getRawD1().prepare(sql).bind(...params).first<T>()) ?? null;
}

async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const result = await getRawD1().prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

async function run(sql: string, ...params: unknown[]): Promise<void> {
  await getRawD1().prepare(sql).bind(...params).run();
}

async function syncUser(identity: IdentityUser): Promise<AppUser> {
  const email = normalizeEmail(identity.email);
  const existing = await first<{ id: string }>(
    "SELECT id FROM users WHERE email = ?",
    email,
  );
  const id = existing?.id ?? crypto.randomUUID();
  if (existing) {
    await run(
      "UPDATE users SET display_name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      identity.displayName,
      id,
    );
  } else {
    await run(
      "INSERT INTO users (id,email,display_name) VALUES (?,?,?)",
      id,
      email,
      identity.displayName,
    );
  }

  const pending = await all<{ id: string; project_id: string }>(
    "SELECT id, project_id FROM project_invitations WHERE email = ? AND status = 'pending'",
    email,
  );
  if (pending.length) {
    const db = getRawD1();
    const statements = pending.flatMap((invitation) => [
      db
        .prepare(
          "INSERT OR IGNORE INTO project_members (project_id,user_id,role) VALUES (?,?, 'member')",
        )
        .bind(invitation.project_id, id),
      db
        .prepare(
          "UPDATE project_invitations SET status = 'accepted', accepted_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(invitation.id),
    ]);
    await db.batch(statements);
  }

  return { id, email, displayName: identity.displayName };
}

async function ensureDevelopmentSeed(user: AppUser): Promise<void> {
  if (process.env.NODE_ENV !== "development") return;
  const membership = await first<{ count: number }>(
    "SELECT COUNT(*) AS count FROM project_members WHERE user_id = ?",
    user.id,
  );
  if ((membership?.count ?? 0) > 0) return;

  const db = getRawD1();
  const statements = [
    db
      .prepare(
        "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES (?,?,?,?,?)",
      )
      .bind(
        "project-mobile-launch",
        user.id,
        "Mobile Launch",
        "Coordinate the v2 mobile release across product, design, and launch operations.",
        "USD",
      ),
    db
      .prepare(
        "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES (?,?,?,?,?)",
      )
      .bind(
        "project-brand-refresh",
        user.id,
        "Brand Refresh",
        "Ship the updated identity system and campaign assets.",
        "USD",
      ),
    db
      .prepare(
        "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES (?,?,?,?,?)",
      )
      .bind(
        "project-q3-planning",
        user.id,
        "Q3 Planning",
        "Prepare the quarterly operating plan and review events.",
        "EUR",
      ),
    ...[
      "project-mobile-launch",
      "project-brand-refresh",
      "project-q3-planning",
    ].map((projectId) =>
      db
        .prepare(
          "INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,'owner')",
        )
        .bind(projectId, user.id),
    ),
    db
      .prepare(
        "INSERT INTO collections (id,project_id,name,color,position) VALUES (?,?,?,?,?)",
      )
      .bind("collection-mobile-product", "project-mobile-launch", "Product", "cyan", 0),
    db
      .prepare(
        "INSERT INTO collections (id,project_id,name,color,position) VALUES (?,?,?,?,?)",
      )
      .bind("collection-mobile-ops", "project-mobile-launch", "Launch ops", "seafoam", 1),
    db
      .prepare(
        "INSERT INTO collections (id,project_id,name,color,position) VALUES (?,?,?,?,?)",
      )
      .bind("collection-brand-creative", "project-brand-refresh", "Creative", "violet", 0),
    db
      .prepare(
        "INSERT INTO collections (id,project_id,name,color,position) VALUES (?,?,?,?,?)",
      )
      .bind("collection-q3-plan", "project-q3-planning", "Operating plan", "amber", 0),
  ];

  const items = [
    [
      "task-onboarding",
      "project-mobile-launch",
      "collection-mobile-product",
      "task",
      "Finalize onboarding flow",
      "Resolve the last interaction notes before the beta handoff.",
      "in_progress",
      "2026-07-16",
      null,
      12_000,
    ],
    [
      "task-checklist",
      "project-mobile-launch",
      "collection-mobile-ops",
      "task",
      "Review launch checklist",
      "Confirm store, analytics, support, and rollback readiness.",
      "todo",
      "2026-07-17",
      null,
      5_000,
    ],
    [
      "task-exports",
      "project-brand-refresh",
      "collection-brand-creative",
      "task",
      "Upload campaign exports",
      "Package the approved campaign files for regional teams.",
      "todo",
      "2026-07-19",
      null,
      8_000,
    ],
    [
      "task-stakeholder",
      "project-q3-planning",
      "collection-q3-plan",
      "task",
      "Prepare stakeholder update",
      "Summarize the approved Q3 operating assumptions.",
      "todo",
      "2026-07-21",
      null,
      4_500,
    ],
    [
      "event-beta-handoff",
      "project-mobile-launch",
      "collection-mobile-ops",
      "event",
      "Beta handoff",
      "Product and launch teams receive the signed beta package.",
      null,
      null,
      "2026-07-18",
      20_000,
    ],
    [
      "event-brand-review",
      "project-brand-refresh",
      "collection-brand-creative",
      "event",
      "Brand review",
      "Final identity review with the regional marketing leads.",
      null,
      null,
      "2026-07-22",
      7_500,
    ],
    [
      "event-q3-kickoff",
      "project-q3-planning",
      "collection-q3-plan",
      "event",
      "Q3 kickoff",
      "Quarterly plan walkthrough for the wider team.",
      null,
      null,
      "2026-07-28",
      null,
    ],
  ];
  for (const item of items) {
    statements.push(
      db
        .prepare(
          "INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,estimated_cost_minor,created_by) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
        )
        .bind(...item, user.id),
    );
  }
  statements.push(
    db
      .prepare(
        "INSERT INTO payments (id,item_id,amount_minor,paid_on,note,created_by) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        "payment-onboarding",
        "task-onboarding",
        9_500,
        "2026-07-11",
        "Prototype testing services",
        user.id,
      ),
    db
      .prepare(
        "INSERT INTO payments (id,item_id,amount_minor,paid_on,note,created_by) VALUES (?,?,?,?,?,?)",
      )
      .bind(
        "payment-brand-review",
        "event-brand-review",
        8_000,
        "2026-07-12",
        "Review venue and production",
        user.id,
      ),
  );
  await db.batch(statements);
}

export async function requireProjectAccess(
  userId: string,
  projectId: string,
): Promise<ProjectAccess> {
  const access = await first<{ role: ProjectRole }>(
    "SELECT role FROM project_members WHERE project_id = ? AND user_id = ?",
    projectId,
    userId,
  );
  if (!access) throw new DomainError("Project not found", "not_found");
  return { projectId, userId, role: access.role };
}

export async function requireProjectOwner(
  userId: string,
  projectId: string,
): Promise<ProjectAccess> {
  const access = await requireProjectAccess(userId, projectId);
  if (access.role !== "owner") {
    throw new DomainError("Only the project owner can do that", "forbidden");
  }
  return access;
}

async function projectForCollection(collectionId: string): Promise<string> {
  const row = await first<{ project_id: string }>(
    "SELECT project_id FROM collections WHERE id = ?",
    collectionId,
  );
  if (!row) throw new DomainError("Collection not found", "not_found");
  return row.project_id;
}

async function authorizedCollectionProject(
  userId: string,
  collectionId: string,
): Promise<string> {
  const projectId = await projectForCollection(collectionId);
  try {
    await requireProjectAccess(userId, projectId);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "not_found" || error.code === "forbidden")
    ) {
      throw new DomainError("Collection not found", "not_found");
    }
    throw error;
  }
  return projectId;
}

async function projectForItem(itemId: string): Promise<string> {
  const row = await first<{ project_id: string }>(
    "SELECT project_id FROM work_items WHERE id = ?",
    itemId,
  );
  if (!row) throw new DomainError("Item not found", "not_found");
  return row.project_id;
}

type ItemRelationContext = {
  id: string;
  projectId: string;
  type: "task" | "event";
};

async function relationItem(itemId: string): Promise<ItemRelationContext> {
  const row = await first<{
    id: string;
    project_id: string;
    type: "task" | "event";
  }>("SELECT id,project_id,type FROM work_items WHERE id = ?", itemId);
  if (!row) throw new DomainError("Item not found", "not_found");
  return { id: row.id, projectId: row.project_id, type: row.type };
}

async function authorizedRelationItem(
  userId: string,
  itemId: string,
): Promise<ItemRelationContext> {
  const item = await relationItem(itemId);
  try {
    await requireProjectAccess(userId, item.projectId);
  } catch (error) {
    if (
      error instanceof DomainError &&
      (error.code === "not_found" || error.code === "forbidden")
    ) {
      throw new DomainError("Item not found", "not_found");
    }
    throw error;
  }
  return item;
}

async function paymentContext(paymentId: string): Promise<{
  projectId: string;
  createdBy: string;
}> {
  const row = await first<{ project_id: string; created_by: string }>(
    "SELECT wi.project_id, p.created_by FROM payments p JOIN work_items wi ON wi.id = p.item_id WHERE p.id = ?",
    paymentId,
  );
  if (!row) throw new DomainError("Payment not found", "not_found");
  return { projectId: row.project_id, createdBy: row.created_by };
}

async function itemFileKeys(itemId: string): Promise<string[]> {
  const rows = await all<{ r2_key: string }>(
    `SELECT fo.r2_key FROM file_objects fo
     JOIN item_files inf ON inf.file_object_id = fo.id
     WHERE inf.item_id = ?
     UNION
     SELECT fo.r2_key FROM file_objects fo
     JOIN payment_receipts pr ON pr.file_object_id = fo.id
     JOIN payments p ON p.id = pr.payment_id
     WHERE p.item_id = ?`,
    itemId,
    itemId,
  );
  return rows.map((row) => row.r2_key);
}

async function projectFileKeys(projectId: string): Promise<string[]> {
  const rows = await all<{ r2_key: string }>(
    "SELECT r2_key FROM file_objects WHERE project_id = ?",
    projectId,
  );
  return rows.map((row) => row.r2_key);
}

async function collectionFileKeys(collectionId: string): Promise<string[]> {
  const rows = await all<{ r2_key: string }>(
    `SELECT fo.r2_key FROM file_objects fo
     JOIN item_files inf ON inf.file_object_id = fo.id
     JOIN work_items wi ON wi.id = inf.item_id
     WHERE wi.collection_id = ?
     UNION
     SELECT fo.r2_key FROM file_objects fo
     JOIN payment_receipts pr ON pr.file_object_id = fo.id
     JOIN payments p ON p.id = pr.payment_id
     JOIN work_items wi ON wi.id = p.item_id
     WHERE wi.collection_id = ?`,
    collectionId,
    collectionId,
  );
  return rows.map((row) => row.r2_key);
}

async function paymentFileKeys(paymentId: string): Promise<string[]> {
  const rows = await all<{ r2_key: string }>(
    `SELECT fo.r2_key FROM file_objects fo
     JOIN payment_receipts pr ON pr.file_object_id = fo.id
     WHERE pr.payment_id = ?`,
    paymentId,
  );
  return rows.map((row) => row.r2_key);
}

export async function listMutationFileKeys(
  identity: IdentityUser,
  mutation: WorkspaceMutation,
): Promise<string[]> {
  if (
    mutation.action !== "delete_project" &&
    mutation.action !== "delete_collection" &&
    mutation.action !== "delete_item" &&
    mutation.action !== "delete_payment"
  ) {
    return [];
  }

  await ensurePreviewSchema();
  const user = await syncUser(identity);
  if (mutation.action === "delete_project") {
    await requireProjectOwner(user.id, mutation.projectId);
    return projectFileKeys(mutation.projectId);
  }
  if (mutation.action === "delete_collection") {
    const projectId = await projectForCollection(mutation.collectionId);
    await requireProjectAccess(user.id, projectId);
    return collectionFileKeys(mutation.collectionId);
  }
  if (mutation.action === "delete_item") {
    const projectId = await projectForItem(mutation.itemId);
    await requireProjectAccess(user.id, projectId);
    return itemFileKeys(mutation.itemId);
  }

  const context = await paymentContext(mutation.paymentId);
  const actor = await requireProjectAccess(user.id, context.projectId);
  if (!canManagePayment(actor, context)) {
    throw new DomainError("You cannot delete this payment", "forbidden");
  }
  return paymentFileKeys(mutation.paymentId);
}

export async function loadWorkspaceSnapshot(
  identity: IdentityUser,
): Promise<WorkspaceSnapshot> {
  await ensurePreviewSchema();
  const user = await syncUser(identity);
  await ensureDevelopmentSeed(user);

  const projects = await all<{
    id: string;
    owner_user_id: string;
    name: string;
    description: string;
    currency: string;
    role: ProjectRole;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT p.id,p.owner_user_id,p.name,p.description,p.currency,pm.role,p.created_at,p.updated_at
     FROM projects p JOIN project_members pm ON pm.project_id = p.id
     WHERE pm.user_id = ? ORDER BY p.updated_at DESC,p.name`,
    user.id,
  );

  const members = await all<{
    project_id: string;
    user_id: string;
    email: string;
    display_name: string;
    role: ProjectRole;
  }>(
    `SELECT pm.project_id,pm.user_id,u.email,u.display_name,pm.role
     FROM project_members pm JOIN users u ON u.id = pm.user_id
     JOIN project_members current ON current.project_id = pm.project_id
     WHERE current.user_id = ? ORDER BY pm.role DESC,u.display_name`,
    user.id,
  );

  const invitations = await all<{
    id: string;
    project_id: string;
    email: string;
    status: "pending";
    created_at: string;
  }>(
    `SELECT pi.id,pi.project_id,pi.email,pi.status,pi.created_at
     FROM project_invitations pi JOIN project_members current ON current.project_id = pi.project_id
     WHERE current.user_id = ? AND current.role = 'owner' AND pi.status = 'pending'
     ORDER BY pi.created_at DESC`,
    user.id,
  );

  const collections = await all<{
    id: string;
    project_id: string;
    name: string;
    color: string;
    position: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT c.id,c.project_id,c.name,c.color,c.position,c.created_at,c.updated_at
     FROM collections c JOIN project_members current ON current.project_id = c.project_id
     WHERE current.user_id = ? ORDER BY c.project_id,c.position,c.created_at`,
    user.id,
  );

  const itemRows = await all<{
    id: string;
    project_id: string;
    collection_id: string;
    type: "task" | "event";
    title: string;
    description: string;
    status: "todo" | "in_progress" | "done" | null;
    due_date: string | null;
    occurrence_date: string | null;
    estimated_cost_minor: number | null;
    created_by: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT wi.* FROM work_items wi
     JOIN project_members current ON current.project_id = wi.project_id
     WHERE current.user_id = ? ORDER BY COALESCE(wi.due_date,wi.occurrence_date,'9999-12-31'),wi.created_at DESC`,
    user.id,
  );

  const files = await all<{
    id: string;
    item_id: string;
    file_object_id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    pinned: number;
    uploaded_by: string;
    created_at: string;
  }>(
    `SELECT inf.id,inf.item_id,inf.file_object_id,fo.filename,fo.content_type,fo.size_bytes,inf.pinned,fo.uploaded_by,fo.created_at
     FROM item_files inf JOIN file_objects fo ON fo.id = inf.file_object_id
     JOIN work_items wi ON wi.id = inf.item_id
     JOIN project_members current ON current.project_id = wi.project_id
     WHERE current.user_id = ? ORDER BY inf.pinned DESC,inf.position,fo.created_at DESC`,
    user.id,
  );

  const paymentRows = await all<{
    id: string;
    item_id: string;
    amount_minor: number;
    paid_on: string;
    note: string;
    created_by: string;
    display_name: string;
    receipt_file_id: string | null;
    receipt_filename: string | null;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT p.id,p.item_id,p.amount_minor,p.paid_on,p.note,p.created_by,u.display_name,
            pr.file_object_id AS receipt_file_id,fo.filename AS receipt_filename,p.created_at,p.updated_at
     FROM payments p JOIN work_items wi ON wi.id = p.item_id
     JOIN project_members current ON current.project_id = wi.project_id
     JOIN users u ON u.id = p.created_by
     LEFT JOIN payment_receipts pr ON pr.payment_id = p.id
     LEFT JOIN file_objects fo ON fo.id = pr.file_object_id
     WHERE current.user_id = ? ORDER BY p.paid_on DESC,p.created_at DESC`,
    user.id,
  );

  const relationRows = await all<{
    id: string;
    project_id: string;
    source_item_id: string;
    target_item_id: string;
    type: RelationType;
    created_by: string;
    created_at: string;
  }>(
    `SELECT wir.id,wir.project_id,wir.source_item_id,wir.target_item_id,
            wir.type,wir.created_by,wir.created_at
     FROM work_item_relations wir
     JOIN project_members current ON current.project_id = wir.project_id
     WHERE current.user_id = ? ORDER BY wir.created_at,wir.id`,
    user.id,
  );

  const fileMap = new Map<string, ItemFileRecord[]>();
  for (const row of files) {
    const value: ItemFileRecord = {
      id: row.id,
      itemId: row.item_id,
      fileObjectId: row.file_object_id,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      pinned: Boolean(row.pinned),
      uploadedBy: row.uploaded_by,
      createdAt: row.created_at,
    };
    fileMap.set(row.item_id, [...(fileMap.get(row.item_id) ?? []), value]);
  }

  const paymentMap = new Map<string, PaymentRecord[]>();
  for (const row of paymentRows) {
    const value: PaymentRecord = {
      id: row.id,
      itemId: row.item_id,
      amountMinor: row.amount_minor,
      paidOn: row.paid_on,
      note: row.note,
      createdBy: row.created_by,
      createdByName: row.display_name,
      receiptFileId: row.receipt_file_id,
      receiptFilename: row.receipt_filename,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
    paymentMap.set(row.item_id, [
      ...(paymentMap.get(row.item_id) ?? []),
      value,
    ]);
  }

  const items: WorkItemRecord[] = itemRows.map((row) => {
    const payments = paymentMap.get(row.id) ?? [];
    const money = summarizeItemMoney(row.estimated_cost_minor, payments);
    const base = {
      id: row.id,
      projectId: row.project_id,
      collectionId: row.collection_id,
      title: row.title,
      description: row.description,
      estimatedCostMinor: row.estimated_cost_minor,
      actualSpendMinor: money.actualMinor,
      varianceMinor: money.varianceMinor,
      createdBy: row.created_by,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      files: fileMap.get(row.id) ?? [],
      payments,
    };
    if (row.type === "task") {
      return {
        ...base,
        type: "task" as const,
        status: validateTaskStatus(row.status),
        dueDate: row.due_date,
        occurrenceDate: null,
      };
    }
    return {
      ...base,
      type: "event" as const,
      status: null,
      dueDate: null,
      occurrenceDate: row.occurrence_date ?? "",
    };
  });

  return {
    user,
    projects: projects.map<ProjectRecord>((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      currency: row.currency,
      ownerUserId: row.owner_user_id,
      role: row.role,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    members: members.map<MemberRecord>((row) => ({
      projectId: row.project_id,
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      role: row.role,
    })),
    invitations: invitations.map<InvitationRecord>((row) => ({
      id: row.id,
      projectId: row.project_id,
      email: row.email,
      status: "pending",
      createdAt: row.created_at,
    })),
    collections: collections.map<CollectionRecord>((row) => ({
      id: row.id,
      projectId: row.project_id,
      name: row.name,
      color: row.color,
      position: row.position,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    items,
    relations: relationRows.map<WorkItemRelationRecord>((row) => ({
      id: row.id,
      projectId: row.project_id,
      sourceItemId: row.source_item_id,
      targetItemId: row.target_item_id,
      type: validateRelationType(row.type),
      createdBy: row.created_by,
      createdAt: row.created_at,
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function applyWorkspaceMutation(
  identity: IdentityUser,
  mutation: WorkspaceMutation,
): Promise<WorkspaceMutationResult> {
  await ensurePreviewSchema();
  const user = await syncUser(identity);
  let createdItemId: string | null = null;

  switch (mutation.action) {
    case "create_project": {
      const projectId = crypto.randomUUID();
      const collectionId = crypto.randomUUID();
      const db = getRawD1();
      await db.batch([
        db
          .prepare(
            "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES (?,?,?,?,?)",
          )
          .bind(
            projectId,
            user.id,
            requireText(mutation.name, "Project name", 120),
            optionalText(mutation.description, 1_000),
            validateCurrency(mutation.currency),
          ),
        db
          .prepare(
            "INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,'owner')",
          )
          .bind(projectId, user.id),
        db
          .prepare(
            "INSERT INTO collections (id,project_id,name,color,position) VALUES (?,?,'General','cyan',0)",
          )
          .bind(collectionId, projectId),
      ]);
      break;
    }
    case "update_project": {
      await requireProjectOwner(user.id, mutation.projectId);
      await run(
        "UPDATE projects SET name = ?, description = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        requireText(mutation.name, "Project name", 120),
        optionalText(mutation.description, 1_000),
        mutation.projectId,
      );
      break;
    }
    case "delete_project": {
      await requireProjectOwner(user.id, mutation.projectId);
      await run("DELETE FROM file_objects WHERE project_id = ?", mutation.projectId);
      await run("DELETE FROM projects WHERE id = ?", mutation.projectId);
      break;
    }
    case "invite_member": {
      await requireProjectOwner(user.id, mutation.projectId);
      const email = normalizeEmail(mutation.email);
      if (email === user.email) {
        throw new DomainError("You are already the project owner", "conflict");
      }
      const existingMember = await first<{ id: string }>(
        "SELECT u.id FROM project_members pm JOIN users u ON u.id = pm.user_id WHERE pm.project_id = ? AND u.email = ?",
        mutation.projectId,
        email,
      );
      if (existingMember) {
        throw new DomainError("That person is already a member", "conflict");
      }
      const pendingInvitation = await first<{ id: string }>(
        "SELECT id FROM project_invitations WHERE project_id = ? AND email = ? AND status = 'pending'",
        mutation.projectId,
        email,
      );
      if (pendingInvitation) {
        throw new DomainError(
          "That email already has a pending invitation",
          "conflict",
        );
      }
      await run(
        `INSERT INTO project_invitations (id,project_id,email,invited_by,status,accepted_at)
         VALUES (?,?,?,?,'pending',NULL)
         ON CONFLICT(project_id,email) DO UPDATE SET status='pending',accepted_at=NULL,invited_by=excluded.invited_by,created_at=CURRENT_TIMESTAMP`,
        crypto.randomUUID(),
        mutation.projectId,
        email,
        user.id,
      );
      break;
    }
    case "remove_member": {
      await requireProjectOwner(user.id, mutation.projectId);
      if (mutation.userId === user.id) {
        throw new DomainError("The project owner cannot be removed", "conflict");
      }
      await run(
        "DELETE FROM project_members WHERE project_id = ? AND user_id = ? AND role = 'member'",
        mutation.projectId,
        mutation.userId,
      );
      break;
    }
    case "create_collection": {
      await requireProjectAccess(user.id, mutation.projectId);
      const position = await first<{ position: number }>(
        "SELECT COALESCE(MAX(position),-1)+1 AS position FROM collections WHERE project_id = ?",
        mutation.projectId,
      );
      await run(
        "INSERT INTO collections (id,project_id,name,color,position) VALUES (?,?,?,?,?)",
        crypto.randomUUID(),
        mutation.projectId,
        requireText(mutation.name, "Collection name", 80),
        optionalText(mutation.color, 24) || "cyan",
        position?.position ?? 0,
      );
      break;
    }
    case "update_collection": {
      const projectId = await projectForCollection(mutation.collectionId);
      await requireProjectAccess(user.id, projectId);
      await run(
        "UPDATE collections SET name = ?, color = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        requireText(mutation.name, "Collection name", 80),
        optionalText(mutation.color, 24) || "cyan",
        mutation.collectionId,
      );
      break;
    }
    case "reorder_collections": {
      await requireProjectAccess(user.id, mutation.projectId);
      const existing = await all<{ id: string }>(
        "SELECT id FROM collections WHERE project_id = ?",
        mutation.projectId,
      );
      const order = validateCollectionOrder(
        existing.map((row) => row.id),
        mutation.collectionIds,
      );
      const db = getRawD1();
      await db.batch(
        order.map((id, position) =>
          db
            .prepare(
              "UPDATE collections SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND project_id = ?",
            )
            .bind(position, id, mutation.projectId),
        ),
      );
      break;
    }
    case "delete_collection": {
      const projectId = await projectForCollection(mutation.collectionId);
      await requireProjectAccess(user.id, projectId);
      const db = getRawD1();
      await db.batch([
        db
          .prepare(
            `DELETE FROM file_objects WHERE id IN (
               SELECT inf.file_object_id FROM item_files inf
               JOIN work_items wi ON wi.id = inf.item_id
               WHERE wi.collection_id = ?
               UNION
               SELECT pr.file_object_id FROM payment_receipts pr
               JOIN payments p ON p.id = pr.payment_id
               JOIN work_items wi ON wi.id = p.item_id
               WHERE wi.collection_id = ?
             )`,
          )
          .bind(mutation.collectionId, mutation.collectionId),
        db
          .prepare("DELETE FROM collections WHERE id = ?")
          .bind(mutation.collectionId),
      ]);
      break;
    }
    case "create_item": {
      const projectId = await projectForCollection(mutation.collectionId);
      await requireProjectAccess(user.id, projectId);
      const estimate =
        mutation.estimatedCostMinor === null ||
        mutation.estimatedCostMinor === undefined
          ? null
          : validateMinorAmount(mutation.estimatedCostMinor);
      if (mutation.type === "task") {
        await run(
          `INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,estimated_cost_minor,created_by)
           VALUES (?,?,?,'task',?,?,?,?,NULL,?,?)`,
          crypto.randomUUID(),
          projectId,
          mutation.collectionId,
          requireText(mutation.title, "Task title", 160),
          optionalText(mutation.description),
          validateTaskStatus(mutation.status),
          validateOptionalIsoDate(mutation.dueDate, "Due date"),
          estimate,
          user.id,
        );
      } else {
        await run(
          `INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,estimated_cost_minor,created_by)
           VALUES (?,?,?,'event',?,?,NULL,NULL,?,?,?)`,
          crypto.randomUUID(),
          projectId,
          mutation.collectionId,
          requireText(mutation.title, "Event title", 160),
          optionalText(mutation.description),
          validateIsoDate(mutation.occurrenceDate, "Occurrence date"),
          estimate,
          user.id,
        );
      }
      break;
    }
    case "update_item": {
      const projectId = await projectForItem(mutation.itemId);
      await requireProjectAccess(user.id, projectId);
      const existing = await first<{ type: "task" | "event" }>(
        "SELECT type FROM work_items WHERE id = ?",
        mutation.itemId,
      );
      if (!existing || existing.type !== mutation.type) {
        throw new DomainError("Item type cannot be changed", "conflict");
      }
      const estimate =
        mutation.estimatedCostMinor === null ||
        mutation.estimatedCostMinor === undefined
          ? null
          : validateMinorAmount(mutation.estimatedCostMinor);
      if (mutation.type === "task") {
        await run(
          `UPDATE work_items SET title=?,description=?,status=?,due_date=?,occurrence_date=NULL,estimated_cost_minor=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          requireText(mutation.title, "Task title", 160),
          optionalText(mutation.description),
          validateTaskStatus(mutation.status),
          validateOptionalIsoDate(mutation.dueDate, "Due date"),
          estimate,
          mutation.itemId,
        );
      } else {
        await run(
          `UPDATE work_items SET title=?,description=?,status=NULL,due_date=NULL,occurrence_date=?,estimated_cost_minor=?,updated_at=CURRENT_TIMESTAMP WHERE id=?`,
          requireText(mutation.title, "Event title", 160),
          optionalText(mutation.description),
          validateIsoDate(mutation.occurrenceDate, "Occurrence date"),
          estimate,
          mutation.itemId,
        );
      }
      break;
    }
    case "delete_item": {
      const projectId = await projectForItem(mutation.itemId);
      await requireProjectAccess(user.id, projectId);
      const db = getRawD1();
      await db.batch([
        db
          .prepare(
            `DELETE FROM file_objects WHERE id IN (
               SELECT file_object_id FROM item_files WHERE item_id = ?
               UNION
               SELECT pr.file_object_id FROM payment_receipts pr
               JOIN payments p ON p.id = pr.payment_id
               WHERE p.item_id = ?
             )`,
          )
          .bind(mutation.itemId, mutation.itemId),
        db.prepare("DELETE FROM work_items WHERE id = ?").bind(mutation.itemId),
      ]);
      break;
    }
    case "create_follow_up_task": {
      const source = await authorizedRelationItem(
        user.id,
        mutation.sourceEventId,
      );
      if (source.type !== "event") {
        throw new DomainError("Follow-up tasks require a source event");
      }
      const collectionProjectId = await authorizedCollectionProject(
        user.id,
        mutation.collectionId,
      );
      if (collectionProjectId !== source.projectId) {
        throw new DomainError(
          "Follow-up task collection must belong to the event project",
        );
      }
      const taskId = crypto.randomUUID();
      const estimate =
        mutation.estimatedCostMinor === null ||
        mutation.estimatedCostMinor === undefined
          ? null
          : validateMinorAmount(mutation.estimatedCostMinor);
      const db = getRawD1();
      await db.batch([
        db
          .prepare(
            `INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,estimated_cost_minor,created_by)
             VALUES (?,?,?,'task',?,?,?,?,NULL,?,?)`,
          )
          .bind(
            taskId,
            source.projectId,
            mutation.collectionId,
            requireText(mutation.title, "Task title", 160),
            optionalText(mutation.description),
            validateTaskStatus(mutation.status),
            validateOptionalIsoDate(mutation.dueDate, "Due date"),
            estimate,
            user.id,
          ),
        db
          .prepare(
            `INSERT INTO work_item_relations (id,project_id,source_item_id,target_item_id,type,created_by)
             VALUES (?,?,?,?, 'follows_from',?)`,
          )
          .bind(
            crypto.randomUUID(),
            source.projectId,
            source.id,
            taskId,
            user.id,
          ),
      ]);
      createdItemId = taskId;
      break;
    }
    case "create_relation": {
      const relationType = validateRelationType(mutation.relationType);
      const endpoints = normalizeRelationEndpoints(
        relationType,
        mutation.sourceItemId,
        mutation.targetItemId,
      );
      const [source, target] = await Promise.all([
        authorizedRelationItem(user.id, endpoints.sourceItemId),
        authorizedRelationItem(user.id, endpoints.targetItemId),
      ]);
      if (source.projectId !== target.projectId) {
        throw new DomainError("Items must belong to the same project");
      }
      if (
        relationType === "blocks" &&
        (source.type !== "task" || target.type !== "task")
      ) {
        throw new DomainError("Blocking relationships require two tasks");
      }
      const relationId = crypto.randomUUID();
      try {
        if (relationType === "related_to") {
          await run(
            `INSERT INTO work_item_relations
             (id,project_id,source_item_id,target_item_id,type,created_by)
             VALUES (?,?,?,?,?,?)`,
            relationId,
            source.projectId,
            source.id,
            target.id,
            relationType,
            user.id,
          );
        } else {
          const result = await getRawD1()
            .prepare(DIRECTED_RELATION_INSERT_SQL)
            .bind(
              ...directedRelationInsertParams({
                id: relationId,
                projectId: source.projectId,
                sourceItemId: source.id,
                targetItemId: target.id,
                type: relationType,
                createdBy: user.id,
              }),
            )
            .run();
          if ((result.meta.changes ?? 0) === 0) {
            throw new DomainError(
              "Relationship would create a cycle",
              "conflict",
            );
          }
        }
      } catch (error) {
        if (isRelationUniqueConstraint(error)) {
          throw new DomainError("Relationship already exists", "conflict");
        }
        throw error;
      }
      break;
    }
    case "delete_relation": {
      const relation = await first<{ project_id: string }>(
        `SELECT wir.project_id
         FROM work_item_relations wir
         JOIN project_members current ON current.project_id = wir.project_id
         WHERE wir.id = ? AND current.user_id = ?`,
        mutation.relationId,
        user.id,
      );
      if (!relation) {
        throw new DomainError("Relationship not found", "not_found");
      }
      await run(
        "DELETE FROM work_item_relations WHERE id = ?",
        mutation.relationId,
      );
      break;
    }
    case "create_payment": {
      const projectId = await projectForItem(mutation.itemId);
      await requireProjectAccess(user.id, projectId);
      await run(
        "INSERT INTO payments (id,item_id,amount_minor,paid_on,note,created_by) VALUES (?,?,?,?,?,?)",
        crypto.randomUUID(),
        mutation.itemId,
        validateMinorAmount(mutation.amountMinor, { positive: true }),
        validateIsoDate(mutation.paidOn, "Payment date"),
        optionalText(mutation.note, 500),
        user.id,
      );
      break;
    }
    case "update_payment": {
      const context = await paymentContext(mutation.paymentId);
      const actor = await requireProjectAccess(user.id, context.projectId);
      if (!canManagePayment(actor, context)) {
        throw new DomainError("You cannot edit this payment", "forbidden");
      }
      await run(
        "UPDATE payments SET amount_minor=?,paid_on=?,note=?,updated_at=CURRENT_TIMESTAMP WHERE id=?",
        validateMinorAmount(mutation.amountMinor, { positive: true }),
        validateIsoDate(mutation.paidOn, "Payment date"),
        optionalText(mutation.note, 500),
        mutation.paymentId,
      );
      break;
    }
    case "delete_payment": {
      const context = await paymentContext(mutation.paymentId);
      const actor = await requireProjectAccess(user.id, context.projectId);
      if (!canManagePayment(actor, context)) {
        throw new DomainError("You cannot delete this payment", "forbidden");
      }
      const db = getRawD1();
      await db.batch([
        db
          .prepare(
            `DELETE FROM file_objects WHERE id IN (
               SELECT file_object_id FROM payment_receipts WHERE payment_id = ?
             )`,
          )
          .bind(mutation.paymentId),
        db.prepare("DELETE FROM payments WHERE id = ?").bind(mutation.paymentId),
      ]);
      break;
    }
  }

  return { snapshot: await loadWorkspaceSnapshot(identity), createdItemId };
}

export async function getUserByIdentity(identity: IdentityUser): Promise<AppUser> {
  await ensurePreviewSchema();
  return syncUser(identity);
}

export async function getFileContext(fileId: string): Promise<{
  id: string;
  projectId: string;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  itemFileId: string | null;
  paymentId: string | null;
  uploadedBy: string;
}> {
  const row = await first<{
    id: string;
    project_id: string;
    r2_key: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    item_file_id: string | null;
    payment_id: string | null;
    uploaded_by: string;
  }>(
    `SELECT fo.id,fo.project_id,fo.r2_key,fo.filename,fo.content_type,fo.size_bytes,
            inf.id AS item_file_id,pr.payment_id,fo.uploaded_by
     FROM file_objects fo
     LEFT JOIN item_files inf ON inf.file_object_id = fo.id
     LEFT JOIN payment_receipts pr ON pr.file_object_id = fo.id
     WHERE fo.id = ?`,
    fileId,
  );
  if (!row) throw new DomainError("File not found", "not_found");
  return {
    id: row.id,
    projectId: row.project_id,
    r2Key: row.r2_key,
    filename: row.filename,
    contentType: row.content_type,
    sizeBytes: row.size_bytes,
    itemFileId: row.item_file_id,
    paymentId: row.payment_id,
    uploadedBy: row.uploaded_by,
  };
}

export async function createFileMetadata(input: {
  identity: IdentityUser;
  itemId?: string;
  paymentId?: string;
  fileId: string;
  r2Key: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}): Promise<{ replacedR2Key: string | null }> {
  await ensurePreviewSchema();
  const user = await syncUser(input.identity);
  let projectId: string;
  if (input.itemId) {
    projectId = await projectForItem(input.itemId);
    await requireProjectAccess(user.id, projectId);
  } else if (input.paymentId) {
    const context = await paymentContext(input.paymentId);
    projectId = context.projectId;
    const actor = await requireProjectAccess(user.id, projectId);
    if (!canManagePayment(actor, context)) {
      throw new DomainError("You cannot add a receipt to this payment", "forbidden");
    }
  } else {
    throw new DomainError("An item or payment is required");
  }

  const replacedReceipt = input.paymentId
    ? await first<{ file_object_id: string; r2_key: string }>(
        `SELECT pr.file_object_id,fo.r2_key FROM payment_receipts pr
         JOIN file_objects fo ON fo.id = pr.file_object_id
         WHERE pr.payment_id = ?`,
        input.paymentId,
      )
    : null;
  const db = getRawD1();
  const metadata = db
    .prepare(
      "INSERT INTO file_objects (id,project_id,r2_key,filename,content_type,size_bytes,uploaded_by) VALUES (?,?,?,?,?,?,?)",
    )
    .bind(
      input.fileId,
      projectId,
      input.r2Key,
      input.filename,
      input.contentType,
      input.sizeBytes,
      user.id,
    );
  const relation = input.itemId
    ? db
        .prepare(
          "INSERT INTO item_files (id,item_id,file_object_id,pinned,position) VALUES (?,?,?,0,0)",
        )
        .bind(crypto.randomUUID(), input.itemId, input.fileId)
    : db
        .prepare(
          "INSERT INTO payment_receipts (payment_id,file_object_id) VALUES (?,?) ON CONFLICT(payment_id) DO UPDATE SET file_object_id=excluded.file_object_id,created_at=CURRENT_TIMESTAMP",
        )
        .bind(input.paymentId, input.fileId);
  const statements = [metadata, relation];
  if (replacedReceipt) {
    statements.push(
      db
        .prepare("DELETE FROM file_objects WHERE id=?")
        .bind(replacedReceipt.file_object_id),
    );
  }
  await db.batch(statements);
  return { replacedR2Key: replacedReceipt?.r2_key ?? null };
}

export async function authorizeFileTarget(
  identity: IdentityUser,
  target: { itemId?: string; paymentId?: string },
): Promise<{ projectId: string }> {
  await ensurePreviewSchema();
  const user = await syncUser(identity);
  if (target.itemId) {
    const projectId = await projectForItem(target.itemId);
    await requireProjectAccess(user.id, projectId);
    return { projectId };
  }
  if (target.paymentId) {
    const context = await paymentContext(target.paymentId);
    const actor = await requireProjectAccess(user.id, context.projectId);
    if (!canManagePayment(actor, context)) {
      throw new DomainError("You cannot add a receipt to this payment", "forbidden");
    }
    return { projectId: context.projectId };
  }
  throw new DomainError("An item or payment is required");
}

export async function setItemFilePinned(
  identity: IdentityUser,
  itemFileId: string,
  pinned: boolean,
): Promise<void> {
  await ensurePreviewSchema();
  const user = await syncUser(identity);
  const row = await first<{ project_id: string }>(
    "SELECT wi.project_id FROM item_files inf JOIN work_items wi ON wi.id=inf.item_id WHERE inf.id=?",
    itemFileId,
  );
  if (!row) throw new DomainError("File not found", "not_found");
  await requireProjectAccess(user.id, row.project_id);
  await run("UPDATE item_files SET pinned=? WHERE id=?", pinned ? 1 : 0, itemFileId);
}

export async function deleteFileMetadata(
  identity: IdentityUser,
  fileId: string,
): Promise<{ r2Key: string }> {
  await ensurePreviewSchema();
  const user = await syncUser(identity);
  const context = await getFileContext(fileId);
  const actor = await requireProjectAccess(user.id, context.projectId);
  if (context.paymentId) {
    const payment = await paymentContext(context.paymentId);
    if (!canManagePayment(actor, payment)) {
      throw new DomainError("You cannot remove this receipt", "forbidden");
    }
  }
  await run("DELETE FROM file_objects WHERE id=?", fileId);
  return { r2Key: context.r2Key };
}
