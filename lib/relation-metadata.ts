import type {
  WorkItemRecord,
  WorkItemRelationRecord,
} from "./domain.ts";

type RelationPhrase = {
  phrase: string;
  type: WorkItemRelationRecord["type"];
  title: string;
  id: string;
};

function compareCodeUnits(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function relationMetadataPhrases(
  itemId: string,
  relations: WorkItemRelationRecord[],
  items: WorkItemRecord[],
): string[] {
  return relations
    .filter(
      (relation) =>
        relation.sourceItemId === itemId ||
        relation.targetItemId === itemId,
    )
    .flatMap<RelationPhrase>((relation) => {
      const outgoing = relation.sourceItemId === itemId;
      const linkedItemId = outgoing
        ? relation.targetItemId
        : relation.sourceItemId;
      const linkedItem = items.find((item) => item.id === linkedItemId);
      if (!linkedItem) return [];

      const prefix =
        relation.type === "follows_from"
          ? outgoing
            ? "Followed by"
            : "Follow-up for"
          : relation.type === "blocks"
            ? outgoing
              ? "Blocks"
              : "Blocked by"
            : "Related to";

      return [
        {
          phrase: `${prefix} ${linkedItem.title}`,
          type: relation.type,
          title: linkedItem.title,
          id: relation.id,
        },
      ];
    })
    .sort(
      (a, b) =>
        compareCodeUnits(a.type, b.type) ||
        compareCodeUnits(a.title, b.title) ||
        compareCodeUnits(a.id, b.id),
    )
    .map(({ phrase }) => phrase);
}

export function workItemMetadata(
  parts: Array<string | null | undefined>,
  itemId: string,
  relations: WorkItemRelationRecord[],
  items: WorkItemRecord[],
): string {
  return [
    ...parts.filter(
      (part): part is string => typeof part === "string" && part.length > 0,
    ),
    ...relationMetadataPhrases(itemId, relations, items),
  ].join(" · ");
}
