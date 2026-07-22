import {
  DomainError,
  normalizeRelationEndpoints,
  validateRelationType,
  validateTaskStatus,
  type RelationType,
} from "./domain.ts";
import type { IdentityUser } from "./auth.ts";
import type {
  ProjectArchiveAttachment,
  ProjectArchiveCollection,
  ProjectArchiveItem,
  ProjectArchiveManifestV1,
  ProjectArchivePayment,
  ProjectArchiveReceipt,
  ProjectArchiveRelation,
} from "./project-archive.ts";

type ArchiveAttachmentSource = Omit<ProjectArchiveAttachment, "sha256"> & {
  r2Key: string;
};

type ArchiveReceiptSource = Omit<ProjectArchiveReceipt, "sha256"> & {
  r2Key: string;
};

export type ProjectArchiveSource = {
  project: ProjectArchiveManifestV1["project"];
  collections: ProjectArchiveCollection[];
  items: ProjectArchiveItem[];
  relations: ProjectArchiveRelation[];
  payments: ProjectArchivePayment[];
  attachments: ArchiveAttachmentSource[];
  receipts: ArchiveReceiptSource[];
};

export type PlannedImportRelation = {
  id: string;
  sourceItemId: string;
  targetItemId: string;
  type: RelationType;
  createdAt: string;
};

export type PlannedImportPayload = {
  archivePath: string;
  r2Key: string;
  fileObjectId: string;
  itemFileId: string | null;
  itemId: string | null;
  paymentId: string | null;
};

export type PlannedProjectImport = {
  manifest: ProjectArchiveManifestV1;
  projectId: string;
  ownerUserId: string;
  collectionIds: Map<string, string>;
  itemIds: Map<string, string>;
  relationIds: Map<string, string>;
  paymentIds: Map<string, string>;
  relations: PlannedImportRelation[];
  payloads: PlannedImportPayload[];
};

async function first<T>(sql: string, ...params: unknown[]): Promise<T | null> {
  const db = await rawDatabase();
  return (await db.prepare(sql).bind(...params).first<T>()) ?? null;
}

async function all<T>(sql: string, ...params: unknown[]): Promise<T[]> {
  const db = await rawDatabase();
  const result = await db.prepare(sql).bind(...params).all<T>();
  return result.results ?? [];
}

async function rawDatabase(): Promise<D1Database> {
  const { getRawD1 } = await import("@/db");
  return getRawD1();
}

function archiveTimestamp(value: string): string {
  const candidate = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new DomainError("Project data could not be exported");
  }
  return parsed.toISOString();
}

export async function loadProjectArchiveSource(
  identity: IdentityUser,
  projectId: string,
): Promise<ProjectArchiveSource> {
  const { getUserByIdentity, requireProjectAccess } = await import(
    "./repository.ts"
  );
  const user = await getUserByIdentity(identity);
  await requireProjectAccess(user.id, projectId);

  const project = await first<{
    id: string;
    name: string;
    description: string;
    currency: string;
  }>(
    `SELECT p.id,p.name,p.description,p.currency
     FROM projects p WHERE p.id = ?`,
    projectId,
  );
  if (!project) throw new DomainError("Project not found", "not_found");

  const collectionRows = await all<{
    id: string;
    name: string;
    color: ProjectArchiveCollection["color"];
    position: number;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT c.id,c.name,c.color,c.position,c.created_at,c.updated_at
     FROM collections c WHERE c.project_id = ?
     ORDER BY c.position,c.created_at,c.id`,
    projectId,
  );

  const itemRows = await all<{
    id: string;
    collection_id: string;
    type: "task" | "event";
    title: string;
    description: string;
    status: "todo" | "done" | null;
    due_date: string | null;
    occurrence_date: string | null;
    estimated_cost_minor: number | null;
    creator_label: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT wi.id,wi.collection_id,wi.type,wi.title,wi.description,wi.status,
            wi.due_date,wi.occurrence_date,wi.estimated_cost_minor,
            COALESCE(wi.imported_creator_label,creator.display_name) AS creator_label,
            wi.created_at,wi.updated_at
     FROM work_items wi JOIN users creator ON creator.id = wi.created_by
     WHERE wi.project_id = ? ORDER BY wi.created_at,wi.id`,
    projectId,
  );

  const relationRows = await all<{
    id: string;
    source_item_id: string;
    target_item_id: string;
    type: RelationType;
    created_at: string;
  }>(
    `SELECT wir.id,wir.source_item_id,wir.target_item_id,wir.type,wir.created_at
     FROM work_item_relations wir WHERE wir.project_id = ?
     ORDER BY wir.created_at,wir.id`,
    projectId,
  );

  const paymentRows = await all<{
    id: string;
    item_id: string;
    amount_minor: number;
    paid_on: string;
    note: string;
    creator_label: string;
    created_at: string;
    updated_at: string;
  }>(
    `SELECT p.id,p.item_id,p.amount_minor,p.paid_on,p.note,
            COALESCE(p.imported_creator_label,creator.display_name) AS creator_label,
            p.created_at,p.updated_at
     FROM payments p
     JOIN work_items wi ON wi.id = p.item_id
     JOIN users creator ON creator.id = p.created_by
     WHERE wi.project_id = ? ORDER BY p.created_at,p.id`,
    projectId,
  );

  const attachmentRows = await all<{
    id: string;
    item_id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    pinned: number;
    position: number;
    uploader_label: string;
    created_at: string;
    r2_key: string;
  }>(
    `SELECT inf.id,inf.item_id,fo.filename,fo.content_type,fo.size_bytes,
            inf.pinned,inf.position,
            COALESCE(fo.imported_uploader_label,uploader.display_name) AS uploader_label,
            fo.created_at,fo.r2_key
     FROM item_files inf
     JOIN work_items wi ON wi.id = inf.item_id
     JOIN file_objects fo ON fo.id = inf.file_object_id
     JOIN users uploader ON uploader.id = fo.uploaded_by
     WHERE fo.project_id = ? AND wi.project_id = ?
     ORDER BY inf.created_at,inf.id`,
    projectId,
    projectId,
  );

  const receiptRows = await all<{
    id: string;
    payment_id: string;
    filename: string;
    content_type: string;
    size_bytes: number;
    uploader_label: string;
    created_at: string;
    r2_key: string;
  }>(
    `SELECT fo.id,pr.payment_id,fo.filename,fo.content_type,fo.size_bytes,
            COALESCE(fo.imported_uploader_label,uploader.display_name) AS uploader_label,
            fo.created_at,fo.r2_key
     FROM payment_receipts pr
     JOIN payments p ON p.id = pr.payment_id
     JOIN work_items wi ON wi.id = p.item_id
     JOIN file_objects fo ON fo.id = pr.file_object_id
     JOIN users uploader ON uploader.id = fo.uploaded_by
     WHERE fo.project_id = ? AND wi.project_id = ?
     ORDER BY pr.created_at,pr.payment_id`,
    projectId,
    projectId,
  );

  const items = itemRows.map<ProjectArchiveItem>((row) => {
    const base = {
      id: row.id,
      collectionId: row.collection_id,
      title: row.title,
      description: row.description,
      estimatedCostMinor: row.estimated_cost_minor,
      creatorLabel: row.creator_label,
      createdAt: archiveTimestamp(row.created_at),
      updatedAt: archiveTimestamp(row.updated_at),
    };
    if (row.type === "task") {
      return {
        ...base,
        type: "task",
        status: validateTaskStatus(row.status),
        dueDate: row.due_date,
      };
    }
    return {
      ...base,
      type: "event",
      occurrenceDate: row.occurrence_date ?? "",
    };
  });

  return {
    project: {
      name: project.name,
      description: project.description,
      currency: project.currency,
    },
    collections: collectionRows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      position: row.position,
      createdAt: archiveTimestamp(row.created_at),
      updatedAt: archiveTimestamp(row.updated_at),
    })),
    items,
    relations: relationRows.map((row) => ({
      id: row.id,
      sourceItemId: row.source_item_id,
      targetItemId: row.target_item_id,
      type: validateRelationType(row.type),
      createdAt: archiveTimestamp(row.created_at),
    })),
    payments: paymentRows.map((row) => ({
      id: row.id,
      itemId: row.item_id,
      amountMinor: row.amount_minor,
      paidOn: row.paid_on,
      note: row.note,
      creatorLabel: row.creator_label,
      createdAt: archiveTimestamp(row.created_at),
      updatedAt: archiveTimestamp(row.updated_at),
    })),
    attachments: attachmentRows.map((row, index) => ({
      id: row.id,
      itemId: row.item_id,
      path: `attachments/${index.toString(36).padStart(6, "0")}`,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      pinned: Boolean(row.pinned),
      position: row.position,
      uploaderLabel: row.uploader_label,
      createdAt: archiveTimestamp(row.created_at),
      r2Key: row.r2_key,
    })),
    receipts: receiptRows.map((row, index) => ({
      id: row.id,
      paymentId: row.payment_id,
      path: `receipts/${index.toString(36).padStart(6, "0")}`,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      uploaderLabel: row.uploader_label,
      createdAt: archiveTimestamp(row.created_at),
      r2Key: row.r2_key,
    })),
  };
}

export function createImportIdPlan(
  manifest: ProjectArchiveManifestV1,
  ownerUserId: string,
): PlannedProjectImport {
  const projectId = crypto.randomUUID();
  const collectionIds = new Map(
    manifest.collections.map((collection) => [
      collection.id,
      crypto.randomUUID(),
    ]),
  );
  const itemIds = new Map(
    manifest.items.map((item) => [item.id, crypto.randomUUID()]),
  );
  const relationIds = new Map(
    manifest.relations.map((relation) => [
      relation.id,
      crypto.randomUUID(),
    ]),
  );
  const paymentIds = new Map(
    manifest.payments.map((payment) => [payment.id, crypto.randomUUID()]),
  );
  const relations = manifest.relations.map((relation) => {
    const endpoints = normalizeRelationEndpoints(
      relation.type,
      itemIds.get(relation.sourceItemId)!,
      itemIds.get(relation.targetItemId)!,
    );
    return {
      id: relationIds.get(relation.id)!,
      ...endpoints,
      type: relation.type,
      createdAt: relation.createdAt,
    };
  });
  const payloads: PlannedImportPayload[] = [
    ...manifest.attachments.map((attachment) => {
      const fileObjectId = crypto.randomUUID();
      return {
        archivePath: attachment.path,
        r2Key: `projects/${projectId}/${fileObjectId}`,
        fileObjectId,
        itemFileId: crypto.randomUUID(),
        itemId: itemIds.get(attachment.itemId)!,
        paymentId: null,
      };
    }),
    ...manifest.receipts.map((receipt) => {
      const fileObjectId = crypto.randomUUID();
      return {
        archivePath: receipt.path,
        r2Key: `projects/${projectId}/${fileObjectId}`,
        fileObjectId,
        itemFileId: null,
        itemId: null,
        paymentId: paymentIds.get(receipt.paymentId)!,
      };
    }),
  ];
  return {
    manifest,
    projectId,
    ownerUserId,
    collectionIds,
    itemIds,
    relationIds,
    paymentIds,
    relations,
    payloads,
  };
}

export async function planProjectImport(
  identity: IdentityUser,
  manifest: ProjectArchiveManifestV1,
): Promise<PlannedProjectImport> {
  const { getUserByIdentity } = await import("./repository.ts");
  const user = await getUserByIdentity(identity);
  return createImportIdPlan(manifest, user.id);
}

export async function persistProjectImport(
  plan: PlannedProjectImport,
): Promise<string> {
  const { manifest, projectId, ownerUserId } = plan;
  const db = await rawDatabase();
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        "INSERT INTO projects (id,owner_user_id,name,description,currency) VALUES (?,?,?,?,?)",
      )
      .bind(
        projectId,
        ownerUserId,
        manifest.project.name,
        manifest.project.description,
        manifest.project.currency,
      ),
    db
      .prepare(
        "INSERT INTO project_members (project_id,user_id,role) VALUES (?,?,'owner')",
      )
      .bind(projectId, ownerUserId),
  ];

  for (const collection of manifest.collections) {
    statements.push(
      db
        .prepare(
          `INSERT INTO collections
           (id,project_id,name,color,position,created_at,updated_at)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(
          plan.collectionIds.get(collection.id)!,
          projectId,
          collection.name,
          collection.color,
          collection.position,
          collection.createdAt,
          collection.updatedAt,
        ),
    );
  }

  for (const item of manifest.items) {
    const itemId = plan.itemIds.get(item.id)!;
    statements.push(
      db
        .prepare(
          `INSERT INTO work_items
           (id,project_id,collection_id,type,title,description,status,due_date,
            occurrence_date,estimated_cost_minor,created_by,imported_creator_label,
            created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          itemId,
          projectId,
          plan.collectionIds.get(item.collectionId)!,
          item.type,
          item.title,
          item.description,
          item.type === "task" ? item.status : null,
          item.type === "task" ? item.dueDate : null,
          item.type === "event" ? item.occurrenceDate : null,
          item.estimatedCostMinor,
          ownerUserId,
          item.creatorLabel,
          item.createdAt,
          item.updatedAt,
        ),
    );
  }

  for (const relation of plan.relations) {
    statements.push(
      db
        .prepare(
          `INSERT INTO work_item_relations
           (id,project_id,source_item_id,target_item_id,type,created_by,created_at)
           VALUES (?,?,?,?,?,?,?)`,
        )
        .bind(
          relation.id,
          projectId,
          relation.sourceItemId,
          relation.targetItemId,
          relation.type,
          ownerUserId,
          relation.createdAt,
        ),
    );
  }

  for (const payment of manifest.payments) {
    statements.push(
      db
        .prepare(
          `INSERT INTO payments
           (id,item_id,amount_minor,paid_on,note,created_by,imported_creator_label,
            created_at,updated_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          plan.paymentIds.get(payment.id)!,
          plan.itemIds.get(payment.itemId)!,
          payment.amountMinor,
          payment.paidOn,
          payment.note,
          ownerUserId,
          payment.creatorLabel,
          payment.createdAt,
          payment.updatedAt,
        ),
    );
  }

  const attachmentsByPath = new Map(
    manifest.attachments.map((attachment) => [attachment.path, attachment]),
  );
  const receiptsByPath = new Map(
    manifest.receipts.map((receipt) => [receipt.path, receipt]),
  );
  for (const payload of plan.payloads) {
    const declaration =
      attachmentsByPath.get(payload.archivePath) ??
      receiptsByPath.get(payload.archivePath)!;
    statements.push(
      db
        .prepare(
          `INSERT INTO file_objects
           (id,project_id,r2_key,filename,content_type,size_bytes,uploaded_by,
            imported_uploader_label,created_at)
           VALUES (?,?,?,?,?,?,?,?,?)`,
        )
        .bind(
          payload.fileObjectId,
          projectId,
          payload.r2Key,
          declaration.filename,
          declaration.contentType,
          declaration.sizeBytes,
          ownerUserId,
          declaration.uploaderLabel,
          declaration.createdAt,
        ),
    );
    if (payload.itemFileId && payload.itemId) {
      const attachment = attachmentsByPath.get(payload.archivePath)!;
      statements.push(
        db
          .prepare(
            `INSERT INTO item_files
             (id,item_id,file_object_id,pinned,position,created_at)
             VALUES (?,?,?,?,?,?)`,
          )
          .bind(
            payload.itemFileId,
            payload.itemId,
            payload.fileObjectId,
            attachment.pinned ? 1 : 0,
            attachment.position,
            attachment.createdAt,
          ),
      );
    } else if (payload.paymentId) {
      const receipt = receiptsByPath.get(payload.archivePath)!;
      statements.push(
        db
          .prepare(
            `INSERT INTO payment_receipts
             (payment_id,file_object_id,created_at) VALUES (?,?,?)`,
          )
          .bind(
            payload.paymentId,
            payload.fileObjectId,
            receipt.createdAt,
          ),
      );
    }
  }

  await db.batch(statements);
  return projectId;
}
