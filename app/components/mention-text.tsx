import type {
  ContactMentionField,
  ContactRecord,
  WorkItemContactMentionRecord,
} from "@/lib/domain";
import { ContactActionTrigger } from "./contact-actions";

export function MentionText({
  text,
  field,
  mentions,
  contacts,
}: {
  text: string;
  field: ContactMentionField;
  mentions: WorkItemContactMentionRecord[];
  contacts: ContactRecord[];
}) {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const ordered = mentions
    .filter((mention) => mention.field === field)
    .sort(
      (left, right) =>
        left.startOffset - right.startOffset ||
        left.endOffset - right.endOffset ||
        (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
    );
  const parts = [];
  let cursor = 0;

  for (const mention of ordered) {
    if (
      !Number.isSafeInteger(mention.startOffset) ||
      !Number.isSafeInteger(mention.endOffset) ||
      mention.startOffset < cursor ||
      mention.endOffset <= mention.startOffset ||
      mention.endOffset > text.length
    ) {
      continue;
    }
    if (mention.startOffset > cursor) {
      parts.push(
        <bdi dir="auto" key={`text-${cursor}`}>
          {text.slice(cursor, mention.startOffset)}
        </bdi>,
      );
    }
    const storedLabel = text.slice(mention.startOffset, mention.endOffset);
    const contact = contactsById.get(mention.contactId);
    if (contact && storedLabel.startsWith("@")) {
      parts.push(
        <ContactActionTrigger
          contact={contact}
          label={`@${contact.name}`}
          className="contact-mention-trigger"
          key={mention.id}
        />,
      );
    } else {
      parts.push(
        <bdi dir="auto" key={mention.id}>
          {storedLabel}
        </bdi>,
      );
    }
    cursor = mention.endOffset;
  }

  if (cursor < text.length || parts.length === 0) {
    parts.push(
      <bdi dir="auto" key={`text-${cursor}`}>
        {text.slice(cursor)}
      </bdi>,
    );
  }

  return (
    <span className="mention-text" dir="auto">
      {parts}
    </span>
  );
}
