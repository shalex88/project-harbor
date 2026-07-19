"use client";

import { useState, type FormEvent } from "react";
import {
  type WorkItemRecord,
  type WorkItemRelationRecord,
  type WorkspaceMutation,
  type WorkspaceSnapshot,
} from "@/lib/domain";
import {
  isRelationCandidateAvailable,
  relationMutation,
  type RelationMeaning,
} from "@/lib/relation-ui";
import { Field, SubmitForm } from "./ui";

const relationMeaningLabels: Record<RelationMeaning, string> = {
  follow_up: "Follow-up item",
  follows_from: "Follows from",
  blocks: "Blocks",
  blocked_by: "Blocked by",
  related_to: "Related item",
};

function relationGroupLabel(
  relation: WorkItemRelationRecord,
  itemId: string,
): string {
  if (relation.type === "related_to") return "Related items";
  const outgoing = relation.sourceItemId === itemId;
  if (relation.type === "follows_from") {
    return outgoing ? "Follow-up items" : "Follows from";
  }
  return outgoing ? "Blocks" : "Blocked by";
}

export function ItemRelationsPanel({
  snapshot,
  item,
  pending,
  onMutate,
  onOpenItem,
  onError,
}: {
  snapshot: WorkspaceSnapshot;
  item: WorkItemRecord;
  pending: boolean;
  onMutate: (mutation: WorkspaceMutation) => Promise<WorkspaceSnapshot>;
  onOpenItem: (itemId: string) => void;
  onError: (message: string) => void;
}) {
  const [relationMeaning, setRelationMeaning] =
    useState<RelationMeaning>("related_to");
  const [relationSearch, setRelationSearch] = useState("");
  const project = snapshot.projects.find(
    (candidate) => candidate.id === item.projectId,
  );
  const itemRelations = snapshot.relations.filter(
    (relation) =>
      relation.sourceItemId === item.id || relation.targetItemId === item.id,
  );
  const relationCandidates = snapshot.items.filter(
    (candidate) =>
      isRelationCandidateAvailable(
        item,
        candidate,
        relationMeaning,
        snapshot.relations,
      ) &&
      candidate.title
        .toLocaleLowerCase()
        .includes(relationSearch.trim().toLocaleLowerCase()),
  );
  const relationGroups = [
    "Follows from",
    "Follow-up items",
    "Blocked by",
    "Blocks",
    "Related items",
  ].map((label) => ({
    label,
    relations: itemRelations.filter(
      (relation) => relationGroupLabel(relation, item.id) === label,
    ),
  }));

  const handleRelationSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onError("");
    try {
      const data = new FormData(event.currentTarget);
      const selectedItemId = String(data.get("relatedItemId") ?? "");
      const relation = relationMutation(item.id, selectedItemId, relationMeaning);
      await onMutate({ action: "create_relation", ...relation });
    } catch (error) {
      onError(
        error instanceof Error ? error.message : "Unable to add relationship",
      );
    }
  };

  const removeRelation = async (relationId: string) => {
    onError("");
    try {
      await onMutate({ action: "delete_relation", relationId });
    } catch (error) {
      onError(
        error instanceof Error
          ? error.message
          : "Unable to remove relationship",
      );
    }
  };

  return (
    <section className="relations-panel">
      <div className="relation-groups">
        {relationGroups.map((group) => (
          <section className="relation-group" key={group.label}>
            <header>
              <h3>{group.label}</h3>
              <span>{group.relations.length}</span>
            </header>
            {group.relations.map((relation) => {
              const linkedItemId =
                relation.sourceItemId === item.id
                  ? relation.targetItemId
                  : relation.sourceItemId;
              const linkedItem = snapshot.items.find(
                (candidate) => candidate.id === linkedItemId,
              );
              const linkedCollection = linkedItem
                ? snapshot.collections.find(
                    (candidate) => candidate.id === linkedItem.collectionId,
                  )
                : null;
              if (!linkedItem) return null;
              const detail =
                linkedItem.type === "task"
                  ? `${linkedItem.status.replace("_", " ")} · ${linkedItem.dueDate ? `Due ${linkedItem.dueDate}` : "No due date"}`
                  : `Occurs ${linkedItem.occurrenceDate}`;
              return (
                <article className="relation-row" key={relation.id}>
                  <button
                    className="relation-open"
                    type="button"
                    onClick={() => onOpenItem(linkedItem.id)}
                  >
                    <span className={`item-kind kind-${linkedItem.type}`}>
                      {linkedItem.type === "task" ? "Task" : "Event"}
                    </span>
                    <span className="row-title">
                      <strong>{linkedItem.title}</strong>
                      <small>
                        {linkedCollection?.name ?? "Collection"} · {detail}
                      </small>
                    </span>
                  </button>
                  <div className="relation-actions">
                    <button
                      className="button button-secondary"
                      type="button"
                      aria-label={`Remove relationship with ${linkedItem.title}`}
                      disabled={pending}
                      onClick={() => void removeRelation(relation.id)}
                    >
                      Remove relationship
                    </button>
                  </div>
                </article>
              );
            })}
            {!group.relations.length ? (
              <p className="relation-empty">
                No {group.label.toLocaleLowerCase()}.
              </p>
            ) : null}
          </section>
        ))}
      </div>

      <SubmitForm onSubmit={handleRelationSubmit} className="relation-add-form">
        <header>
          <h3>Add relationship</h3>
          <span>Items must belong to {project?.name ?? "this project"}.</span>
        </header>
        <div className="relation-add-grid">
          <Field label="Relationship">
            <select
              name="relationMeaning"
              value={relationMeaning}
              onChange={(event) =>
                setRelationMeaning(event.target.value as RelationMeaning)
              }
            >
              {(item.type === "task"
                ? ([
                    "follow_up",
                    "follows_from",
                    "blocks",
                    "blocked_by",
                    "related_to",
                  ] as const)
                : (["follow_up", "follows_from", "related_to"] as const)
              ).map((meaning) => (
                <option key={meaning} value={meaning}>
                  {relationMeaningLabels[meaning]}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Search project items">
            <input
              type="search"
              value={relationSearch}
              onChange={(event) => setRelationSearch(event.target.value)}
              placeholder="Search by title"
            />
          </Field>
        </div>
        <Field label="Item">
          <select
            name="relatedItemId"
            required
            disabled={!relationCandidates.length}
          >
            <option value="">Select an item</option>
            {relationCandidates.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.type === "task" ? "Task" : "Event"} · {candidate.title}
              </option>
            ))}
          </select>
        </Field>
        <button
          className="button button-primary"
          type="submit"
          disabled={pending || !relationCandidates.length}
        >
          {pending ? "Saving…" : "Add relationship"}
        </button>
      </SubmitForm>
    </section>
  );
}
