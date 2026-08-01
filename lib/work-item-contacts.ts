import type {
  ContactMentionField,
  ContactMentionInput,
  ContactRecord,
} from "./domain";

export type MentionRange = Omit<ContactMentionInput, "field">;
export type MentionEditorValue = {
  text: string;
  mentions: MentionRange[];
};
export type MentionQuery = {
  startOffset: number;
  endOffset: number;
  query: string;
};

type MentionContact = Pick<ContactRecord, "id" | "name" | "roleOrCompany">;

const QUERY_PATTERN = /^[\p{L}\p{M}\p{N} _-]*$/u;
const TRIGGER_BOUNDARY_PATTERN = /[\s\p{P}\p{S}]/u;

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
}

function stableTextCompare(left: string, right: string): number {
  const normalizedLeft = normalizeSearchText(left);
  const normalizedRight = normalizeSearchText(right);
  if (normalizedLeft < normalizedRight) return -1;
  if (normalizedLeft > normalizedRight) return 1;
  return 0;
}

export function mentionContactLabel(
  contact: Pick<ContactRecord, "name" | "roleOrCompany">,
): string {
  return contact.roleOrCompany.trim() || contact.name;
}

function sortMentions(mentions: MentionRange[]): MentionRange[] {
  return [...mentions].sort(
    (left, right) =>
      left.startOffset - right.startOffset ||
      left.endOffset - right.endOffset ||
      stableTextCompare(left.contactId, right.contactId),
  );
}

export function findMentionQuery(
  text: string,
  caretOffset: number,
  mentions: MentionRange[] = [],
): MentionQuery | null {
  if (
    !Number.isSafeInteger(caretOffset) ||
    caretOffset < 0 ||
    caretOffset > text.length
  ) {
    return null;
  }

  const startOffset = text.lastIndexOf("@", Math.max(0, caretOffset - 1));
  if (startOffset < 0) return null;
  if (
    mentions.some(
      (mention) =>
        startOffset >= mention.startOffset && startOffset < mention.endOffset,
    )
  ) {
    return null;
  }
  if (
    startOffset > 0 &&
    !TRIGGER_BOUNDARY_PATTERN.test(text[startOffset - 1] ?? "")
  ) {
    return null;
  }

  const query = text.slice(startOffset + 1, caretOffset);
  if (!QUERY_PATTERN.test(query)) return null;
  return { startOffset, endOffset: caretOffset, query };
}

function contactScore(contact: MentionContact, query: string): number | null {
  const name = normalizeSearchText(contact.name);
  const role = normalizeSearchText(contact.roleOrCompany);
  if (!query) return 6;
  if (role === query) return 0;
  if (role.startsWith(query)) return 1;
  if (name === query) return 2;
  if (name.startsWith(query)) return 3;
  if (role.includes(query)) return 4;
  if (name.includes(query)) return 5;
  return null;
}

export function rankMentionContacts<T extends MentionContact>(
  contacts: T[],
  query: string,
): T[] {
  const normalizedQuery = normalizeSearchText(query);
  return contacts
    .map((contact) => ({
      contact,
      score: contactScore(contact, normalizedQuery),
    }))
    .filter(
      (entry): entry is { contact: T; score: number } => entry.score !== null,
    )
    .sort(
      (left, right) =>
        left.score - right.score ||
        stableTextCompare(left.contact.name, right.contact.name) ||
        stableTextCompare(left.contact.id, right.contact.id),
    )
    .map((entry) => entry.contact);
}

export function insertContactMention(
  value: MentionEditorValue,
  query: MentionQuery,
  contact: Pick<ContactRecord, "id" | "name" | "roleOrCompany">,
  maxLength: number,
): { value: MentionEditorValue; caretOffset: number } | null {
  const replacement = `@${mentionContactLabel(contact)}`;
  const replacedLength = query.endOffset - query.startOffset;
  if (value.text.length - replacedLength + replacement.length > maxLength) {
    return null;
  }
  const delta = replacement.length - replacedLength;
  const endOffset = query.startOffset + replacement.length;
  const mentions = value.mentions.flatMap<MentionRange>((mention) => {
    if (mention.endOffset <= query.startOffset) return [mention];
    if (mention.startOffset >= query.endOffset) {
      return [
        {
          ...mention,
          startOffset: mention.startOffset + delta,
          endOffset: mention.endOffset + delta,
        },
      ];
    }
    return [];
  });

  mentions.push({
    contactId: contact.id,
    startOffset: query.startOffset,
    endOffset,
  });

  return {
    value: {
      text:
        value.text.slice(0, query.startOffset) +
        replacement +
        value.text.slice(query.endOffset),
      mentions: sortMentions(mentions),
    },
    caretOffset: endOffset,
  };
}

export function reconcileMentionText(
  value: MentionEditorValue,
  nextText: string,
): MentionEditorValue {
  if (value.text === nextText) {
    return { text: nextText, mentions: sortMentions(value.mentions) };
  }

  let prefixLength = 0;
  const sharedLength = Math.min(value.text.length, nextText.length);
  while (
    prefixLength < sharedLength &&
    value.text[prefixLength] === nextText[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < value.text.length - prefixLength &&
    suffixLength < nextText.length - prefixLength &&
    value.text[value.text.length - suffixLength - 1] ===
      nextText[nextText.length - suffixLength - 1]
  ) {
    suffixLength += 1;
  }

  const previousChangeEnd = value.text.length - suffixLength;
  const nextChangeEnd = nextText.length - suffixLength;
  const delta = nextChangeEnd - previousChangeEnd;
  const mentions = value.mentions.flatMap<MentionRange>((mention) => {
    if (mention.endOffset <= prefixLength) return [mention];
    if (mention.startOffset >= previousChangeEnd) {
      return [
        {
          ...mention,
          startOffset: mention.startOffset + delta,
          endOffset: mention.endOffset + delta,
        },
      ];
    }
    return [];
  });

  return { text: nextText, mentions: sortMentions(mentions) };
}

export function replaceMentionText(
  value: MentionEditorValue,
  startOffset: number,
  endOffset: number,
  replacement: string,
): MentionEditorValue {
  const safeStart = Math.max(0, Math.min(startOffset, value.text.length));
  const safeEnd = Math.max(safeStart, Math.min(endOffset, value.text.length));
  const delta = replacement.length - (safeEnd - safeStart);
  const mentions = value.mentions.flatMap<MentionRange>((mention) => {
    if (mention.endOffset <= safeStart) return [mention];
    if (mention.startOffset >= safeEnd) {
      return [
        {
          ...mention,
          startOffset: mention.startOffset + delta,
          endOffset: mention.endOffset + delta,
        },
      ];
    }
    return [];
  });

  return {
    text:
      value.text.slice(0, safeStart) +
      replacement +
      value.text.slice(safeEnd),
    mentions: sortMentions(mentions),
  };
}

export function removeContactMentions(
  value: MentionEditorValue,
  contactId: string,
): MentionEditorValue {
  return {
    text: value.text,
    mentions: value.mentions.filter(
      (mention) => mention.contactId !== contactId,
    ),
  };
}

export function normalizeMentionLabels(
  value: MentionEditorValue,
  contacts: Pick<ContactRecord, "id" | "name" | "roleOrCompany">[],
): MentionEditorValue {
  const contactsById = new Map(contacts.map((contact) => [contact.id, contact]));
  const normalizedMentions: MentionRange[] = [];
  const chunks: string[] = [];
  let sourceOffset = 0;
  let targetOffset = 0;

  for (const mention of sortMentions(value.mentions)) {
    const contact = contactsById.get(mention.contactId);
    if (
      !contact ||
      mention.startOffset < sourceOffset ||
      mention.startOffset < 0 ||
      mention.endOffset <= mention.startOffset ||
      mention.endOffset > value.text.length
    ) {
      continue;
    }

    const leading = value.text.slice(sourceOffset, mention.startOffset);
    const label = `@${mentionContactLabel(contact)}`;
    chunks.push(leading, label);
    targetOffset += leading.length;
    normalizedMentions.push({
      contactId: contact.id,
      startOffset: targetOffset,
      endOffset: targetOffset + label.length,
    });
    targetOffset += label.length;
    sourceOffset = mention.endOffset;
  }

  chunks.push(value.text.slice(sourceOffset));
  return { text: chunks.join(""), mentions: normalizedMentions };
}

export function serializeMentionField(
  value: MentionEditorValue,
  field: ContactMentionField,
): { text: string; mentions: ContactMentionInput[] } {
  const leadingLength = value.text.length - value.text.trimStart().length;
  const retainedEnd = value.text.trimEnd().length;
  const text = value.text.slice(leadingLength, retainedEnd);
  const mentions = sortMentions(value.mentions).flatMap<ContactMentionInput>(
    (mention) => {
      if (
        mention.startOffset < leadingLength ||
        mention.endOffset > retainedEnd
      ) {
        return [];
      }
      return [
        {
          ...mention,
          field,
          startOffset: mention.startOffset - leadingLength,
          endOffset: mention.endOffset - leadingLength,
        },
      ];
    },
  );
  return { text, mentions };
}
