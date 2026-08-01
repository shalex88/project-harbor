import {
  DomainError,
  type ContactMentionInput,
} from "./domain.ts";

export type ContactIdentity = {
  id: string;
  projectId: string;
  name: string;
};

export type ValidatedWorkItemContactState = {
  links: { contactId: string; manuallyLinked: boolean }[];
  mentions: ContactMentionInput[];
};

export const WORK_ITEM_CONTACT_INSERT_SQL =
  "INSERT INTO work_item_contacts (project_id,item_id,contact_id,manually_linked) VALUES (?,?,?,?)";

export const WORK_ITEM_CONTACT_MENTION_INSERT_SQL =
  "INSERT INTO work_item_contact_mentions (id,project_id,item_id,contact_id,field,start_offset,end_offset) VALUES (?,?,?,?,?,?,?)";

function stableCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function validateContact(
  contactId: string,
  projectId: string,
  contactsById: Map<string, ContactIdentity>,
): ContactIdentity {
  const contact = contactsById.get(contactId);
  if (!contact || contact.projectId !== projectId) {
    throw new DomainError("Contact is not available in this project");
  }
  return contact;
}

export function validateWorkItemContactState(input: {
  projectId: string;
  title: string;
  description: string;
  manualContactIds: string[];
  contactMentions: ContactMentionInput[];
  contacts: ContactIdentity[];
}): ValidatedWorkItemContactState {
  const contactsById = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const manualContactIds = new Set<string>();
  for (const contactId of input.manualContactIds) {
    if (manualContactIds.has(contactId)) {
      throw new DomainError("Manual contacts must not contain duplicates");
    }
    validateContact(contactId, input.projectId, contactsById);
    manualContactIds.add(contactId);
  }

  const mentions = [...input.contactMentions].sort(
    (left, right) =>
      stableCompare(left.field, right.field) ||
      left.startOffset - right.startOffset ||
      left.endOffset - right.endOffset ||
      stableCompare(left.contactId, right.contactId),
  );
  const linkedContactIds = new Set(manualContactIds);
  let previous: ContactMentionInput | null = null;
  for (const mention of mentions) {
    if (mention.field !== "title" && mention.field !== "description") {
      throw new DomainError("Contact mention field must be title or description");
    }
    if (
      !Number.isSafeInteger(mention.startOffset) ||
      !Number.isSafeInteger(mention.endOffset) ||
      mention.startOffset < 0 ||
      mention.endOffset <= mention.startOffset
    ) {
      throw new DomainError("Contact mention range is invalid");
    }
    const text = mention.field === "title" ? input.title : input.description;
    if (mention.endOffset > text.length) {
      throw new DomainError("Contact mention range is outside its field");
    }
    if (
      previous?.field === mention.field &&
      mention.startOffset < previous.endOffset
    ) {
      throw new DomainError("Contact mentions must not overlap");
    }
    const contact = validateContact(
      mention.contactId,
      input.projectId,
      contactsById,
    );
    if (
      text.slice(mention.startOffset, mention.endOffset) !== `@${contact.name}`
    ) {
      throw new DomainError("Contact mention does not match the contact name");
    }
    linkedContactIds.add(contact.id);
    previous = mention;
  }

  const links = [...linkedContactIds]
    .sort(stableCompare)
    .map((contactId) => ({
      contactId,
      manuallyLinked: manualContactIds.has(contactId),
    }));
  return { links, mentions };
}
