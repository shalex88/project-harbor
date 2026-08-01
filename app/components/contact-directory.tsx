"use client";

import type { ContactRecord, ProjectRecord } from "@/lib/domain";
import { EmptyState } from "./ui";

export function ContactGrid({
  contacts,
  projects,
  showProject = false,
  emptyDescription = "Add the people relevant to this project.",
  onEdit,
  onDelete,
}: {
  contacts: ContactRecord[];
  projects: ProjectRecord[];
  showProject?: boolean;
  emptyDescription?: string;
  onEdit: (contact: ContactRecord) => void;
  onDelete: (contact: ContactRecord) => void;
}) {
  const projectNames = new Map(
    projects.map((project) => [project.id, project.name]),
  );

  if (!contacts.length) {
    return (
      <EmptyState title="No contacts yet" description={emptyDescription} />
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
