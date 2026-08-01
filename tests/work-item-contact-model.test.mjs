import assert from "node:assert/strict";
import test from "node:test";

import {
  findMentionQuery,
  insertContactMention,
  normalizeMentionLabels,
  rankMentionContacts,
  reconcileMentionText,
  removeContactMentions,
  replaceMentionText,
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

test("existing structured mentions never reopen the contact query", () => {
  const text = "Call @Maya Levi regarding @law";
  const mentions = [
    { contactId: "maya", startOffset: 5, endOffset: 15 },
  ];

  assert.equal(findMentionQuery(text, 15, mentions), null);
  assert.equal(findMentionQuery(text, 25, mentions), null);
  assert.deepEqual(findMentionQuery(text, text.length, mentions), {
    startOffset: 26,
    endOffset: 30,
    query: "law",
  });
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

test("selection inserts a role label with the contact id and returns the next caret", () => {
  const result = insertContactMention(
    { text: "Call a @lawyer", mentions: [] },
    { startOffset: 7, endOffset: 14, query: "lawyer" },
    contacts[1],
  );

  assert.equal(result.value.text, "Call a @Lawyer");
  assert.deepEqual(result.value.mentions, [
    { contactId: "maya", startOffset: 7, endOffset: 14 },
  ]);
  assert.equal(result.caretOffset, 14);

  const hebrewText = "פגישה עם @עורכת דין";
  const hebrewQuery = findMentionQuery(hebrewText, hebrewText.length);
  assert.ok(hebrewQuery);
  const hebrewResult = insertContactMention(
    { text: hebrewText, mentions: [] },
    hebrewQuery,
    contacts[0],
  );
  assert.equal(hebrewResult.value.text, "פגישה עם @עורכת דין");
  assert.equal((hebrewResult.value.text.match(/@/g) ?? []).length, 1);
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

test("explicit multiline and paste edits preserve plain text offsets", () => {
  const value = {
    text: "First @Maya Levi last",
    mentions: [{ contactId: "maya", startOffset: 6, endOffset: 16 }],
  };

  assert.deepEqual(replaceMentionText(value, 5, 5, "\n"), {
    text: "First\n @Maya Levi last",
    mentions: [{ contactId: "maya", startOffset: 7, endOffset: 17 }],
  });
  assert.deepEqual(replaceMentionText(value, 4, 17, "\nNext"), {
    text: "Firs\nNextlast",
    mentions: [],
  });
});

test("manual removal keeps text and current roles rewrite ranges safely", () => {
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
      text: "Call @Lawyer",
      mentions: [{ contactId: "maya", startOffset: 5, endOffset: 12 }],
    },
    [{ ...contacts[1], roleOrCompany: "Senior Counsel" }],
  );
  assert.equal(normalized.text, "Call @Senior Counsel");
  assert.deepEqual(normalized.mentions[0], {
    contactId: "maya",
    startOffset: 5,
    endOffset: 20,
  });

  const fallback = normalizeMentionLabels(
    {
      text: "Call @contact",
      mentions: [{ contactId: "maya", startOffset: 5, endOffset: 13 }],
    },
    [{ ...contacts[1], roleOrCompany: "" }],
  );
  assert.equal(fallback.text, "Call @Maya Levi");
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
