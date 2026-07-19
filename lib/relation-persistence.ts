import type { RelationType } from "./domain.ts";

type DirectedRelationInsert = {
  id: string;
  projectId: string;
  sourceItemId: string;
  targetItemId: string;
  type: Exclude<RelationType, "related_to">;
  createdBy: string;
};

export const DIRECTED_RELATION_INSERT_SQL = `
  WITH RECURSIVE
  new_relation(id,project_id,source_item_id,target_item_id,type,created_by) AS (
    VALUES (?,?,?,?,?,?)
  ),
  reachable(item_id) AS (
    SELECT wir.target_item_id
    FROM work_item_relations wir
    JOIN new_relation nr
      ON wir.project_id = nr.project_id
     AND wir.type = nr.type
     AND wir.source_item_id = nr.target_item_id
    UNION
    SELECT wir.target_item_id
    FROM work_item_relations wir
    JOIN reachable r ON r.item_id = wir.source_item_id
    JOIN new_relation nr
      ON wir.project_id = nr.project_id
     AND wir.type = nr.type
  )
  INSERT INTO work_item_relations
    (id,project_id,source_item_id,target_item_id,type,created_by)
  SELECT id,project_id,source_item_id,target_item_id,type,created_by
  FROM new_relation nr
  WHERE NOT EXISTS (
    SELECT 1 FROM reachable WHERE item_id = nr.source_item_id
  )
`;

export function directedRelationInsertParams(
  relation: DirectedRelationInsert,
): [string, string, string, string, Exclude<RelationType, "related_to">, string] {
  return [
    relation.id,
    relation.projectId,
    relation.sourceItemId,
    relation.targetItemId,
    relation.type,
    relation.createdBy,
  ];
}

export function isRelationUniqueConstraint(error: unknown): boolean {
  return (
    error instanceof Error &&
    /UNIQUE constraint failed: work_item_relations\./i.test(error.message)
  );
}
