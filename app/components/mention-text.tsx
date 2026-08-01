import type {
  ContactMentionField,
  ContactRecord,
  WorkItemContactMentionRecord,
} from "@/lib/domain";
import { mentionContactLabel } from "@/lib/work-item-contacts";
import { ContactActionTrigger } from "./contact-actions";

const RTL_SCRIPT_PATTERN = /[\p{Script=Hebrew}\p{Script=Arabic}]/u;
const LETTER_PATTERN = /\p{L}/u;

function textDirection(text: string): "ltr" | "rtl" {
  for (const character of text) {
    if (RTL_SCRIPT_PATTERN.test(character)) return "rtl";
    if (LETTER_PATTERN.test(character)) return "ltr";
  }
  return "ltr";
}

export function MentionText({
  text,
  field,
  mentions,
  contacts,
}: {
  text: string;
  field: ContactMentionField;
  mentions: Pick<
    WorkItemContactMentionRecord,
    "id" | "contactId" | "field" | "startOffset" | "endOffset"
  >[];
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
  let visibleText = "";

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
      const leading = text.slice(cursor, mention.startOffset);
      parts.push(leading);
      visibleText += leading;
    }
    const storedLabel = text.slice(mention.startOffset, mention.endOffset);
    const contact = contactsById.get(mention.contactId);
    if (contact && storedLabel.startsWith("@")) {
      const label = mentionContactLabel(contact);
      parts.push(
        <ContactActionTrigger
          contact={contact}
          label={label}
          className="contact-mention-trigger"
          key={mention.id}
        />,
      );
      visibleText += label;
    } else {
      parts.push(
        <bdi dir="auto" key={mention.id}>
          {storedLabel}
        </bdi>,
      );
      visibleText += storedLabel;
    }
    cursor = mention.endOffset;
  }

  if (cursor < text.length || parts.length === 0) {
    const trailing = text.slice(cursor);
    parts.push(trailing);
    visibleText += trailing;
  }

  return (
    <span className="mention-text" dir={textDirection(visibleText)}>
      {parts}
    </span>
  );
}
