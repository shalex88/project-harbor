"use client";

import type {
  ContactRecord,
  ProjectRecord,
  WorkspaceSnapshot,
} from "@/lib/domain";
import {
  ALL_CONTACT_PROJECTS,
  contactsForProject,
} from "@/lib/contact-filter";
import { EmptyState } from "./ui";

export function ContactGrid({
  contacts,
  projects,
  showProject = false,
  emptyTitle = "No contacts yet",
  emptyDescription = "Add the people relevant to this project.",
  onEdit,
  onDelete,
}: {
  contacts: ContactRecord[];
  projects: ProjectRecord[];
  showProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  onEdit: (contact: ContactRecord) => void;
  onDelete: (contact: ContactRecord) => void;
}) {
  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );

  if (!contacts.length) {
    return (
      <EmptyState title={emptyTitle} description={emptyDescription} />
    );
  }

  return (
    <div className="contact-grid">
      {contacts.map((contact) => (
        <article className="contact-card" key={contact.id}>
          <div className="contact-card-heading">
            <div dir="auto">
              <h3>{contact.name}</h3>
              {contact.roleOrCompany ? <p>{contact.roleOrCompany}</p> : null}
            </div>
            {showProject ? (
              <span className="contact-project" dir="auto">
                {projectNames.get(contact.projectId) ?? "Project unavailable"}
              </span>
            ) : null}
          </div>

          <div className="contact-details">
            {contact.email ? (
              <a href={`mailto:${contact.email}`}>{contact.email}</a>
            ) : null}
            {contact.phone ? (
              <a href={`tel:${contact.phone}`}>{contact.phone}</a>
            ) : null}
            {!contact.email && !contact.phone ? (
              <span>No contact details</span>
            ) : null}
          </div>

          {contact.notes ? (
            <p className="contact-notes" dir="auto">
              {contact.notes}
            </p>
          ) : null}

          <div className="contact-actions">
            <button
              className="button button-secondary"
              type="button"
              onClick={() => onEdit(contact)}
            >
              Edit
            </button>
            <button
              className="button button-danger"
              type="button"
              onClick={() => onDelete(contact)}
            >
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}

export function ContactsWorkspace({
  snapshot,
  selectedProjectId,
  onSelectedProjectChange,
  onEdit,
  onDelete,
}: {
  snapshot: WorkspaceSnapshot;
  selectedProjectId: string;
  onSelectedProjectChange: (projectId: string) => void;
  onEdit: (contact: ContactRecord) => void;
  onDelete: (contact: ContactRecord) => void;
}) {
  const contacts = contactsForProject(snapshot.contacts, selectedProjectId);
  const filtered = selectedProjectId !== ALL_CONTACT_PROJECTS;

  return (
    <section className="contacts-workspace" aria-label="All project contacts">
      <div className="contact-filter-bar" aria-label="Contact filters">
        <label className="contact-project-filter">
          <span>Project</span>
          <select
            aria-label="Filter contacts by project"
            value={selectedProjectId}
            onChange={(event) =>
              onSelectedProjectChange(event.target.value)
            }
          >
            <option value={ALL_CONTACT_PROJECTS}>All projects</option>
            {snapshot.projects.map((project) => (
              <option value={project.id} key={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <ContactGrid
        contacts={contacts}
        projects={snapshot.projects}
        showProject
        emptyTitle={filtered ? "No contacts in this project" : "No contacts yet"}
        emptyDescription={
          filtered
            ? "Add the first contact for this project."
            : "Add a contact to any project to build your workspace directory."
        }
        onEdit={onEdit}
        onDelete={onDelete}
      />
    </section>
  );
}
