import { normalizeRelationEndpoints } from "./domain.ts";
import type {
  RelationType,
  WorkItemRecord,
  WorkItemRelationRecord,
} from "./domain.ts";

export type RelationMeaning =
  | "follow_up"
  | "follows_from"
  | "blocks"
  | "blocked_by"
  | "related_to";

export function relationMutation(
  itemId: string,
  selectedItemId: string,
  meaning: RelationMeaning,
): {
  sourceItemId: string;
  targetItemId: string;
  relationType: RelationType;
} {
  let sourceItemId = itemId;
  let targetItemId = selectedItemId;
  let relationType: RelationType = "related_to";

  if (meaning === "follows_from") {
    sourceItemId = selectedItemId;
    targetItemId = itemId;
    relationType = "follows_from";
  } else if (meaning === "blocked_by") {
    sourceItemId = selectedItemId;
    targetItemId = itemId;
    relationType = "blocks";
  } else if (meaning === "follow_up") {
    relationType = "follows_from";
  } else if (meaning === "blocks") {
    relationType = "blocks";
  }

  return {
    ...normalizeRelationEndpoints(
      relationType,
      sourceItemId,
      targetItemId,
    ),
    relationType,
  };
}

export function isRelationCandidateAvailable(
  item: Pick<WorkItemRecord, "id" | "projectId" | "type">,
  candidate: Pick<WorkItemRecord, "id" | "projectId" | "type">,
  meaning: RelationMeaning,
  relations: WorkItemRelationRecord[],
): boolean {
  if (candidate.projectId !== item.projectId || candidate.id === item.id) {
    return false;
  }
  if (
    (meaning === "blocks" || meaning === "blocked_by") &&
    (item.type !== "task" || candidate.type !== "task")
  ) {
    return false;
  }

  const expected = relationMutation(item.id, candidate.id, meaning);
  return !relations.some(
    (relation) =>
      relation.type === expected.relationType &&
      relation.sourceItemId === expected.sourceItemId &&
      relation.targetItemId === expected.targetItemId,
  );
}
