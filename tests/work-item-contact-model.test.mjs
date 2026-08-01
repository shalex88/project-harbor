import assert from "node:assert/strict";
import test from "node:test";

import {
  findMentionQuery,
  insertContactMention,
  normalizeMentionLabels,
  rankMentionContacts,
  reconcileMentionText,
  removeContactMentions,
  serializeMentionField,
} from "../lib/work-item-contacts.ts";

const contacts = [
  {
    id: "dana",
    projectId: "project-1",
    name: "דנה כהן",
    roleOrCompany: "עורכת דין",
  },
  {
    id: "maya",
    projectId: "project-1",
    name: "Maya Levi",
    roleOrCompany: "Lawyer",
  },
  {
    id: "dan",
    projectId: "project-1",
    name: "Dan Reed",
    roleOrCompany: "Architect",
  },
];

test("mention queries support Hebrew roles and do not trigger inside email", () => {
  assert.deepEqual(findMentionQuery("התקשר אל @עורך דין", 18), {
    startOffset: 9,
    endOffset: 18,
    query: "עורך דין",
  });
  assert.equal(findMentionQuery("mail dana@example.com", 17), null);
});

test("role prefixes rank before names and remain stable", () => {
  assert.deepEqual(
    rankMentionContacts(contacts, "law").map((contact) => contact.id),
    ["maya"],
  );
  assert.deepEqual(
    rankMentionContacts(contacts, "דנה").map((contact) => contact.id),
    ["dana"],
  );
});

test("selection inserts a contact id and returns the next caret", () => {
  const result = insertContactMention(
    { text: "Call a @lawyer", mentions: [] },
    { startOffset: 7, endOffset: 14, query: "lawyer" },
    contacts[1],
  );

  assert.equal(result.value.text, "Call a @Maya Levi");
  assert.deepEqual(result.value.mentions, [
    { contactId: "maya", startOffset: 7, endOffset: 17 },
  ]);
  assert.equal(result.caretOffset, 17);
});

test("text edits shift later mentions and unlink an edited mention", () => {
  const value = {
    text: "Call @Maya Levi and @Dan Reed",
    mentions: [
      { contactId: "maya", startOffset: 5, endOffset: 15 },
      { contactId: "dan", startOffset: 20, endOffset: 29 },
    ],
  };

  assert.deepEqual(
    reconcileMentionText(value, "Please call @Maya Levi and @Dan Reed")
      .mentions,
    [
      { contactId: "maya", startOffset: 12, endOffset: 22 },
      { contactId: "dan", startOffset: 27, endOffset: 36 },
    ],
  );
  assert.deepEqual(
    reconcileMentionText(value, "Call @May Levi and @Dan Reed").mentions,
    [{ contactId: "dan", startOffset: 19, endOffset: 28 }],
  );
});

test("manual removal keeps text and current names rewrite ranges safely", () => {
  const removed = removeContactMentions(
    {
      text: "התקשר אל @דנה",
      mentions: [{ contactId: "dana", startOffset: 9, endOffset: 13 }],
    },
    "dana",
  );
  assert.equal(removed.text, "התקשר אל @דנה");
  assert.deepEqual(removed.mentions, []);

  const normalized = normalizeMentionLabels(
    {
      text: "Call @Dana",
      mentions: [{ contactId: "dana", startOffset: 5, endOffset: 10 }],
    },
    [{ ...contacts[0], name: "Dana Cohen" }],
  );
  assert.equal(normalized.text, "Call @Dana Cohen");
  assert.deepEqual(normalized.mentions[0], {
    contactId: "dana",
    startOffset: 5,
    endOffset: 16,
  });
});

test("serialization trims fields and shifts UTF-16 ranges", () => {
  assert.deepEqual(
    serializeMentionField(
      {
        text: "  Call @דנה  ",
        mentions: [{ contactId: "dana", startOffset: 7, endOffset: 11 }],
      },
      "title",
    ),
    {
      text: "Call @דנה",
      mentions: [
        {
          contactId: "dana",
          field: "title",
          startOffset: 5,
          endOffset: 9,
        },
      ],
    },
  );
});
