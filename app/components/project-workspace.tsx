"use client";

import { useMemo, useState, type FormEvent } from "react";
import type {
  CollectionRecord,
  EventRecord,
  TaskRecord,
  WorkspaceMutation,
  WorkspaceSnapshot,
} from "@/lib/domain";
import { formatMoney, summarizeSpending } from "@/lib/domain";
import { workItemMetadata } from "@/lib/relation-metadata";
import { EmptyState, Field, FormActions, MetricCard, Modal, SubmitForm } from "./ui";

type DialogState =
  | { kind: "project" }
  | { kind: "project-delete" }
  | { kind: "invite" }
  | { kind: "collection-create" }
  | { kind: "collection-edit"; collection: CollectionRecord }
  | { kind: "collection-delete"; collection: CollectionRecord }
  | null;

export function ProjectWorkspace({
  snapshot,
  projectId,
  activeCollectionId,
  pending,
  onSelectCollection,
  onCreateItem,
  onOpenItem,
  onMutate,
}: {
  snapshot: WorkspaceSnapshot;
  projectId: string;
  activeCollectionId: string | null;
  pending: boolean;
  onSelectCollection: (collectionId: string) => void;
  onCreateItem: (type: "task" | "event", collectionId: string) => void;
  onOpenItem: (itemId: string) => void;
  onMutate: (mutation: WorkspaceMutation) => Promise<void>;
}) {
  const [dialog, setDialog] = useState<DialogState>(null);
  const project = snapshot.projects.find((candidate) => candidate.id === projectId);
  const collections = useMemo(
    () => snapshot.collections.filter((collection) => collection.projectId === projectId).sort((a, b) => a.position - b.position),
    [snapshot.collections, projectId],
  );
  const activeCollection =
    collections.find((collection) => collection.id === activeCollectionId) ?? collections[0] ?? null;
  const items = snapshot.items.filter(
    (item) => item.projectId === projectId && (!activeCollection || item.collectionId === activeCollection.id),
  );
  const tasks = items.filter((item): item is TaskRecord => item.type === "task");
  const events = items.filter((item): item is EventRecord => item.type === "event");
  const members = snapshot.members.filter((member) => member.projectId === projectId);
  const invitations = snapshot.invitations.filter((invitation) => invitation.projectId === projectId);
  const canManageMembers = project?.role === "owner";

  if (!project) {
    return <EmptyState title="Project unavailable" description="This project may have been removed or you may no longer have access." />;
  }

  const projectSpending = summarizeSpending(
    snapshot.items
      .filter((item) => item.projectId === projectId)
      .map((item) => ({
        currency: project.currency,
        estimatedMinor: item.estimatedCostMinor,
        actualMinor: item.actualSpendMinor,
      })),
  )[0];

  const submitProject = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onMutate({
      action: "update_project",
      projectId,
      name: String(data.get("name") ?? ""),
      description: String(data.get("description") ?? ""),
    });
    setDialog(null);
  };

  const deleteProject = async () => {
    await onMutate({ action: "delete_project", projectId });
    setDialog(null);
  };

  const submitInvite = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    await onMutate({ action: "invite_member", projectId, email: String(data.get("email") ?? "") });
    setDialog(null);
  };

  const submitCollection = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (dialog?.kind === "collection-edit") {
      await onMutate({
        action: "update_collection",
        collectionId: dialog.collection.id,
        name: String(data.get("name") ?? ""),
        color: String(data.get("color") ?? "cyan"),
      });
    } else {
      await onMutate({
        action: "create_collection",
        projectId,
        name: String(data.get("name") ?? ""),
        color: String(data.get("color") ?? "cyan"),
      });
    }
    setDialog(null);
  };

  const moveCollection = async (collectionId: string, direction: -1 | 1) => {
    const index = collections.findIndex((collection) => collection.id === collectionId);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= collections.length) return;
    const order = collections.map((collection) => collection.id);
    [order[index], order[target]] = [order[target], order[index]];
    await onMutate({ action: "reorder_collections", projectId, collectionIds: order });
  };

  return (
    <div className="project-stack">
      <section className="project-hero">
        <div>
          <p className="eyebrow">{project.currency} project</p>
          <h2>{project.name}</h2>
          <p>{project.description || "A shared workspace for this project."}</p>
        </div>
        <div className="project-actions">
          {canManageMembers ? (
            <button className="button button-secondary" type="button" onClick={() => setDialog({ kind: "invite" })}>
              Invite member
            </button>
          ) : null}
          {canManageMembers ? (
            <button className="button button-secondary" type="button" onClick={() => setDialog({ kind: "project" })}>
              Project settings
            </button>
          ) : null}
        </div>
      </section>

      <section className="metric-grid project-metrics" aria-label="Project summary">
        <MetricCard label="collections" value={collections.length} />
        <MetricCard label="open tasks" value={snapshot.items.filter((item) => item.projectId === projectId && item.type === "task" && item.status !== "done").length} accent="blue" />
        <MetricCard label="dated events" value={snapshot.items.filter((item) => item.projectId === projectId && item.type === "event").length} accent="seafoam" />
        <MetricCard label="estimated cost" value={formatMoney(projectSpending?.estimatedMinor ?? 0, project.currency)} />
        <MetricCard label="actual spend" value={formatMoney(projectSpending?.actualMinor ?? 0, project.currency)} accent="seafoam" />
        <MetricCard label="variance" value={formatMoney(projectSpending?.varianceMinor ?? 0, project.currency)} accent={(projectSpending?.varianceMinor ?? 0) > 0 ? "warning" : "blue"} />
      </section>

      <section className="collection-section">
        <header className="section-heading">
          <div>
            <p className="eyebrow">Structure</p>
            <h2>Collections</h2>
          </div>
          <button className="button button-primary" type="button" onClick={() => setDialog({ kind: "collection-create" })}>
            + New collection
          </button>
        </header>
        <div className="collection-tabs" role="tablist" aria-label="Project collections">
          {collections.map((collection, index) => (
            <div className={`collection-tab-wrap ${activeCollection?.id === collection.id ? "active" : ""}`} key={collection.id}>
              <button
                className="collection-tab"
                type="button"
                role="tab"
                aria-selected={activeCollection?.id === collection.id}
                onClick={() => onSelectCollection(collection.id)}
              >
                <span className={`collection-color color-${collection.color}`} aria-hidden="true" />
                {collection.name}
                <small>{snapshot.items.filter((item) => item.collectionId === collection.id).length}</small>
              </button>
              <div className="collection-menu">
                <button type="button" onClick={() => moveCollection(collection.id, -1)} disabled={index === 0 || pending} aria-label={`Move ${collection.name} left`}>←</button>
                <button type="button" onClick={() => moveCollection(collection.id, 1)} disabled={index === collections.length - 1 || pending} aria-label={`Move ${collection.name} right`}>→</button>
                <button type="button" onClick={() => setDialog({ kind: "collection-edit", collection })} aria-label={`Edit ${collection.name}`}>Edit collection</button>
                <button type="button" onClick={() => setDialog({ kind: "collection-delete", collection })} aria-label={`Delete ${collection.name}`}>Delete collection</button>
              </div>
            </div>
          ))}
        </div>
        {!collections.length ? (
          <EmptyState
            title="Create the first collection"
            description="Collections keep related tasks and events together inside a project."
            action={<button className="button button-primary" type="button" onClick={() => setDialog({ kind: "collection-create" })}>New collection</button>}
          />
        ) : null}
      </section>

      {activeCollection ? (
        <div className="collection-work-grid">
          <section className="panel-card">
            <header className="panel-header">
              <div><h2>Tasks</h2><span className="count-chip">{tasks.length}</span></div>
              <button className="button button-primary compact-button" type="button" onClick={() => onCreateItem("task", activeCollection.id)}>+ New task</button>
            </header>
            <div className="collection-item-list">
              {tasks.map((task) => (
                <button type="button" key={task.id} onClick={() => onOpenItem(task.id)}>
                  <span className={`task-check ${task.status === "done" ? "complete" : ""}`} aria-hidden="true">{task.status === "done" ? "✓" : ""}</span>
                  <span className="row-title">
                    <strong>{task.title}</strong>
                    <small>
                      {workItemMetadata(
                        [
                          task.dueDate ? `Due ${task.dueDate}` : "No due date",
                          task.status.replace("_", " "),
                        ],
                        task.id,
                        snapshot.relations,
                        snapshot.items,
                      )}
                    </small>
                  </span>
                  <span className="row-arrow" aria-hidden="true">›</span>
                </button>
              ))}
              {!tasks.length ? <EmptyState title="No tasks here" description="Add actionable work to this collection." /> : null}
            </div>
          </section>
          <section className="panel-card">
            <header className="panel-header">
              <div><h2>Events</h2><span className="count-chip">{events.length}</span></div>
              <button className="button button-primary compact-button" type="button" onClick={() => onCreateItem("event", activeCollection.id)}>+ New event</button>
            </header>
            <div className="collection-item-list">
              {events.map((event) => (
                <button type="button" key={event.id} onClick={() => onOpenItem(event.id)}>
                  <span className="event-mini-date" aria-hidden="true">{event.occurrenceDate.slice(5)}</span>
                  <span className="row-title">
                    <strong>{event.title}</strong>
                    <small>
                      {workItemMetadata(
                        [`Occurs ${event.occurrenceDate}`],
                        event.id,
                        snapshot.relations,
                        snapshot.items,
                      )}
                    </small>
                  </span>
                  <span className="row-arrow" aria-hidden="true">›</span>
                </button>
              ))}
              {!events.length ? <EmptyState title="No events here" description="Add a dated occurrence that does not require action." /> : null}
            </div>
          </section>
        </div>
      ) : null}

      <section className="people-section">
        <header className="section-heading">
          <div><p className="eyebrow">Access</p><h2>Members</h2></div>
          {canManageMembers ? <button className="button button-secondary" type="button" onClick={() => setDialog({ kind: "invite" })}>Invite member</button> : null}
        </header>
        <div className="member-grid">
          {members.map((member) => (
            <article className="member-card" key={member.userId}>
              <span className="avatar" aria-hidden="true">{member.displayName.slice(0, 2).toUpperCase()}</span>
              <span><strong>{member.displayName}</strong><small>{member.email}</small></span>
              <span className="role-chip">{member.role}</span>
              {canManageMembers && member.role !== "owner" ? (
                <button className="icon-button member-remove" type="button" aria-label={`Remove ${member.displayName}`} onClick={() => { if (window.confirm(`Remove ${member.displayName} from this project?`)) void onMutate({ action: "remove_member", projectId, userId: member.userId }); }}>×</button>
              ) : null}
            </article>
          ))}
        </div>
        {canManageMembers ? (
          <div className="pending-invitations">
            <h3>Pending invitations</h3>
            {invitations.length ? invitations.map((invitation) => (
              <div key={invitation.id}><span>{invitation.email}</span><small>Invited {invitation.createdAt.slice(0, 10)}</small></div>
            )) : <p>No pending invitations.</p>}
          </div>
        ) : null}
      </section>

      <Modal open={dialog?.kind === "project"} title="Project settings" description={`Currency is fixed at ${project.currency}.`} onClose={() => setDialog(null)}>
        <SubmitForm onSubmit={submitProject}>
          <Field label="Project name"><input name="name" defaultValue={project.name} required maxLength={120} /></Field>
          <Field label="Description"><textarea name="description" defaultValue={project.description} maxLength={1000} /></Field>
          <FormActions submitLabel="Save project" pending={pending} onCancel={() => setDialog(null)} />
        </SubmitForm>
        {canManageMembers ? (
          <div className="danger-zone">
            <div>
              <h3>Delete project</h3>
              <p>Remove this project, including all collections, tasks, events, files, payments, and member access.</p>
            </div>
            <button className="button button-danger" type="button" onClick={() => setDialog({ kind: "project-delete" })}>Delete project</button>
          </div>
        ) : null}
      </Modal>

      <Modal open={dialog?.kind === "project-delete"} title="Delete project" description="This permanently removes the project and everything in it." onClose={() => setDialog(null)} size="small">
        <p className="confirmation-copy">Delete <strong>{project.name}</strong>? This cannot be undone.</p>
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button>
          <button className="button button-danger" type="button" disabled={pending} onClick={deleteProject}>Delete project</button>
        </div>
      </Modal>

      <Modal open={dialog?.kind === "invite"} title="Invite member" description="They will join automatically when the same email signs in." onClose={() => setDialog(null)} size="small">
        <SubmitForm onSubmit={submitInvite}>
          <Field label="Email address"><input name="email" type="email" required autoComplete="email" placeholder="teammate@example.com" /></Field>
          <FormActions submitLabel="Send invitation" pending={pending} onCancel={() => setDialog(null)} />
        </SubmitForm>
      </Modal>

      <Modal
        open={dialog?.kind === "collection-create" || dialog?.kind === "collection-edit"}
        title={dialog?.kind === "collection-edit" ? "Edit collection" : "New collection"}
        onClose={() => setDialog(null)}
        size="small"
      >
        <SubmitForm onSubmit={submitCollection}>
          <Field label="Collection name"><input name="name" defaultValue={dialog?.kind === "collection-edit" ? dialog.collection.name : ""} required maxLength={80} /></Field>
          <Field label="Color"><select name="color" defaultValue={dialog?.kind === "collection-edit" ? dialog.collection.color : "cyan"}><option value="cyan">Cyan</option><option value="seafoam">Seafoam</option><option value="violet">Violet</option><option value="amber">Amber</option></select></Field>
          <FormActions submitLabel={dialog?.kind === "collection-edit" ? "Save collection" : "Create collection"} pending={pending} onCancel={() => setDialog(null)} />
        </SubmitForm>
      </Modal>

      <Modal open={dialog?.kind === "collection-delete"} title="Delete collection" description="Its tasks, events, files, payments, and receipts will also be removed." onClose={() => setDialog(null)} size="small">
        <p className="confirmation-copy">Delete <strong>{dialog?.kind === "collection-delete" ? dialog.collection.name : "this collection"}</strong>? This cannot be undone.</p>
        <div className="form-actions">
          <button className="button button-secondary" type="button" onClick={() => setDialog(null)}>Cancel</button>
          <button className="button button-danger" type="button" disabled={pending} onClick={async () => { if (dialog?.kind !== "collection-delete") return; await onMutate({ action: "delete_collection", collectionId: dialog.collection.id }); setDialog(null); }}>Delete collection</button>
        </div>
      </Modal>
    </div>
  );
}
