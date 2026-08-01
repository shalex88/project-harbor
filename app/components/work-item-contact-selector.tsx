"use client";

import { useState, type ReactElement } from "react";
import type { ContactRecord } from "@/lib/domain";
import { ContactActionTrigger } from "./contact-actions";

export function WorkItemContactSelector({
  contacts,
  manualContactIds,
  mentionedContactIds,
  onManualContactIdsChange,
  onRemoveContact,
}: {
  contacts: ContactRecord[];
  manualContactIds: string[];
  mentionedContactIds: string[];
  onManualContactIdsChange: (ids: string[]) => void;
  onRemoveContact: (contactId: string) => void;
}): ReactElement {
  const [selection, setSelection] = useState("");
  const linkedIds = new Set([...manualContactIds, ...mentionedContactIds]);
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const linkedContacts = [...linkedIds].flatMap((contactId) => {
    const contact = contactsById.get(contactId);
    return contact ? [contact] : [];
  });
  const availableContacts = contacts.filter((contact) => !linkedIds.has(contact.id));

  const addManualContact = (contactId: string) => {
    setSelection("");
    if (!contactId || manualContactIds.includes(contactId)) return;
    onManualContactIdsChange([...manualContactIds, contactId]);
  };

  return (
    <div className="field work-item-contact-selector">
      <label className="field-label" htmlFor="work-item-contact-select">
        Contacts
      </label>
      <select
        id="work-item-contact-select"
        value={selection}
        onChange={(event) => {
          setSelection(event.target.value);
          addManualContact(event.target.value);
        }}
      >
        <option value="">Add a contact manually…</option>
        {availableContacts.map((contact) => (
          <option value={contact.id} key={contact.id}>
            {contact.name}
            {contact.roleOrCompany ? ` · ${contact.roleOrCompany}` : ""}
          </option>
        ))}
      </select>
      {linkedContacts.length ? (
        <div className="contact-chip-list" aria-label="Linked contacts">
          {linkedContacts.map((contact) => (
            <div className="contact-chip" key={contact.id}>
              <ContactActionTrigger
                contact={contact}
                label={contact.name}
                className="contact-chip-name"
              />
              {contact.roleOrCompany ? (
                <small>
                  <bdi dir="auto">{contact.roleOrCompany}</bdi>
                </small>
              ) : null}
              <button
                className="contact-chip-remove"
                type="button"
                aria-label={`Remove ${contact.name} from this item`}
                onClick={() => onRemoveContact(contact.id)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      ) : (
        <span className="field-hint">No contacts linked</span>
      )}
    </div>
  );
}
