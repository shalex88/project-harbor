export type AuthorizedFollowUpSource = {
  id: string;
  projectId: string;
  type: "task" | "event";
};

export type AuthorizedFollowUpContext =
  | {
      status: "ok";
      source: AuthorizedFollowUpSource;
      collectionProjectId: string;
    }
  | { status: "source_not_found" }
  | { status: "collection_not_found" }
  | { status: "project_mismatch" };

export const AUTHORIZED_FOLLOW_UP_SOURCE_SQL = `
  SELECT wi.id,wi.project_id,wi.type
  FROM work_items wi
  JOIN project_members current ON current.project_id = wi.project_id
  WHERE wi.id = ? AND current.user_id = ?
`;

export const AUTHORIZED_FOLLOW_UP_COLLECTION_SQL = `
  SELECT c.project_id
  FROM collections c
  JOIN project_members current ON current.project_id = c.project_id
  WHERE c.id = ? AND current.user_id = ?
`;

export async function loadAuthorizedFollowUpContext(
  db: D1Database,
  userId: string,
  sourceItemId: string,
  collectionId: string,
): Promise<AuthorizedFollowUpContext> {
  const source = await db
    .prepare(AUTHORIZED_FOLLOW_UP_SOURCE_SQL)
    .bind(sourceItemId, userId)
    .first<{
      id: string;
      project_id: string;
      type: "task" | "event";
    }>();
  if (!source) return { status: "source_not_found" };

  const collection = await db
    .prepare(AUTHORIZED_FOLLOW_UP_COLLECTION_SQL)
    .bind(collectionId, userId)
    .first<{ project_id: string }>();
  if (!collection) return { status: "collection_not_found" };
  if (collection.project_id !== source.project_id) {
    return { status: "project_mismatch" };
  }

  return {
    status: "ok",
    source: {
      id: source.id,
      projectId: source.project_id,
      type: source.type,
    },
    collectionProjectId: collection.project_id,
  };
}

type FollowUpPersistenceBase = {
  itemId: string;
  relationId: string;
  sourceItemId: string;
  projectId: string;
  collectionId: string;
  createdBy: string;
  title: string;
  description: string;
  estimatedCostMinor: number | null;
};

export type FollowUpPersistenceInput = FollowUpPersistenceBase &
  (
    | {
        type: "task";
        status: "todo" | "done";
        dueDate: string | null;
      }
    | {
        type: "event";
        occurrenceDate: string;
      }
  );

export async function persistFollowUpItem(
  db: D1Database,
  input: FollowUpPersistenceInput,
  additionalStatements: D1PreparedStatement[] = [],
): Promise<void> {
  const itemStatement =
    input.type === "task"
      ? db
          .prepare(
            `INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,estimated_cost_minor,created_by)
             VALUES (?,?,?,'task',?,?,?,?,NULL,?,?)`,
          )
          .bind(
            input.itemId,
            input.projectId,
            input.collectionId,
            input.title,
            input.description,
            input.status,
            input.dueDate,
            input.estimatedCostMinor,
            input.createdBy,
          )
      : db
          .prepare(
            `INSERT INTO work_items (id,project_id,collection_id,type,title,description,status,due_date,occurrence_date,estimated_cost_minor,created_by)
             VALUES (?,?,?,'event',?,?,NULL,NULL,?,?,?)`,
          )
          .bind(
            input.itemId,
            input.projectId,
            input.collectionId,
            input.title,
            input.description,
            input.occurrenceDate,
            input.estimatedCostMinor,
            input.createdBy,
          );
  const relationStatement = db
    .prepare(
      `INSERT INTO work_item_relations (id,project_id,source_item_id,target_item_id,type,created_by)
       VALUES (?,?,?,?,'follows_from',?)`,
    )
    .bind(
      input.relationId,
      input.projectId,
      input.sourceItemId,
      input.itemId,
      input.createdBy,
    );

  await db.batch([
    itemStatement,
    relationStatement,
    ...additionalStatements,
  ]);
}
