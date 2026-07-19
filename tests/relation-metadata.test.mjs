import assert from "node:assert/strict";
import test from "node:test";

import {
  relationMetadataPhrases,
  workItemMetadata,
} from "../lib/relation-metadata.ts";

const items = [
  { id: "kickoff", title: "Kickoff" },
  { id: "follow-up", title: "Follow-up" },
  { id: "blocker", title: "Blocker" },
  { id: "reference-z", title: "Reference Z" },
  { id: "reference-a", title: "Reference A" },
];

const relations = [
  {
    id: "relation-reference-z",
    type: "related_to",
    sourceItemId: "follow-up",
    targetItemId: "reference-z",
  },
  {
    id: "relation-follow",
    type: "follows_from",
    sourceItemId: "kickoff",
    targetItemId: "follow-up",
  },
  {
    id: "relation-reference-a",
    type: "related_to",
    sourceItemId: "follow-up",
    targetItemId: "reference-a",
  },
  {
    id: "relation-block",
    type: "blocks",
    sourceItemId: "blocker",
    targetItemId: "follow-up",
  },
];

test("relationship metadata uses the current item's perspective", () => {
  assert.deepEqual(
    relationMetadataPhrases("follow-up", relations, items),
    [
      "Blocked by Blocker",
      "Follow-up for Kickoff",
      "Related to Reference A",
      "Related to Reference Z",
    ],
  );
  assert.deepEqual(
    relationMetadataPhrases("kickoff", relations, items),
    ["Followed by Follow-up"],
  );
  assert.deepEqual(
    relationMetadataPhrases("blocker", relations, items),
    ["Blocks Follow-up"],
  );
  assert.deepEqual(
    relationMetadataPhrases("reference-a", relations, items),
    ["Related to Follow-up"],
  );
});

test("metadata appends every ordered phrase after existing parts", () => {
  assert.equal(
    workItemMetadata(
      ["Q3 Planning", "Operating plan"],
      "follow-up",
      relations,
      items,
    ),
    "Q3 Planning · Operating plan · Blocked by Blocker · Follow-up for Kickoff · Related to Reference A · Related to Reference Z",
  );
});

test("items without relationships retain their existing metadata", () => {
  assert.equal(
    workItemMetadata(
      ["Mobile Launch", "Product"],
      "unrelated",
      relations,
      items,
    ),
    "Mobile Launch · Product",
  );
});

test("missing linked items and empty metadata parts are ignored", () => {
  assert.deepEqual(
    relationMetadataPhrases(
      "follow-up",
      [
        {
          id: "broken",
          type: "related_to",
          sourceItemId: "follow-up",
          targetItemId: "missing",
        },
      ],
      items,
    ),
    [],
  );
  assert.equal(
    workItemMetadata([null, "", undefined], "unrelated", [], items),
    "",
  );
});

test("title ordering is independent of the runtime locale", () => {
  const unicodeItems = [
    { id: "current", title: "Current" },
    { id: "zulu", title: "Zulu" },
    { id: "angstrom", title: "Ångström" },
  ];
  const unicodeRelations = [
    {
      id: "relation-angstrom",
      type: "related_to",
      sourceItemId: "current",
      targetItemId: "angstrom",
    },
    {
      id: "relation-zulu",
      type: "related_to",
      sourceItemId: "current",
      targetItemId: "zulu",
    },
  ];

  assert.deepEqual(
    relationMetadataPhrases("current", unicodeRelations, unicodeItems),
    ["Related to Zulu", "Related to Ångström"],
  );
});
