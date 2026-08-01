import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const itemSheet = await readFile(
  new URL("app/components/item-sheet.tsx", root),
  "utf8",
);
const dashboards = await readFile(
  new URL("app/components/dashboards.tsx", root),
  "utf8",
);
const projectWorkspace = await readFile(
  new URL("app/components/project-workspace.tsx", root),
  "utf8",
);
const openSurface = await readFile(
  new URL("app/components/work-item-open-surface.tsx", root),
  "utf8",
).catch(() => "");
const styles = await readFile(new URL("app/globals.css", root), "utf8");

test("item create edit and follow-up paths serialize contact state", () => {
  assert.match(itemSheet, /normalizeMentionLabels/);
  assert.match(itemSheet, /valueForField\(item, "title"\)/);
  assert.match(itemSheet, /valueForField\(item, "description"\)/);
  assert.match(
    itemSheet,
    /snapshot\.contacts\.filter\([\s\S]*?contact\.projectId === project\?\.id/,
  );
  assert.match(itemSheet, /<ContactMentionEditor[\s\S]*?label="Title"/);
  assert.match(itemSheet, /<ContactMentionEditor[\s\S]*?label="Description"/);
  assert.match(itemSheet, /multiline=\{false\}/);
  assert.match(itemSheet, /multiline=\{true\}/);
  assert.match(itemSheet, /<WorkItemContactSelector/);
  assert.match(itemSheet, /serializeMentionField\(titleValue, "title"\)/);
  assert.match(
    itemSheet,
    /serializeMentionField\(\s*descriptionValue,\s*"description"/,
  );
  assert.match(itemSheet, /manualContactIds,/);
  assert.match(itemSheet, /contactMentions: \[\.\.\.title\.mentions, \.\.\.description\.mentions\]/);
  assert.match(itemSheet, /action: "create_follow_up_item"[\s\S]*?\.\.\.contactFields/);
  assert.match(itemSheet, /action: "update_item"[\s\S]*?\.\.\.common/);
  assert.match(itemSheet, /action: "create_item"[\s\S]*?\.\.\.common/);
});

test("removing a contact keeps text while stripping both fields' metadata", () => {
  assert.match(itemSheet, /removeContactMentions/);
  assert.match(itemSheet, /setManualContactIds\([\s\S]*?filter/);
  assert.match(itemSheet, /setTitleValue\([\s\S]*?removeContactMentions/);
  assert.match(itemSheet, /setDescriptionValue\([\s\S]*?removeContactMentions/);
  assert.match(itemSheet, /mentionedContactIds/);
});

test("all title surfaces receive contacts and use legal overlay open targets", () => {
  const allSurfaces = `${dashboards}\n${projectWorkspace}`;
  const titleCalls = allSurfaces.match(/<WorkItemTitle\b[^>]*>/g) ?? [];
  assert.equal(titleCalls.length, 7);
  for (const call of titleCalls) {
    assert.match(call, /contacts=\{snapshot\.contacts\}/);
  }
  assert.match(openSurface, /className="work-item-open-target"/);
  assert.match(openSurface, /aria-label=\{label\}/);
  assert.match(openSurface, /onClick=\{onOpen\}/);
  assert.doesNotMatch(
    allSurfaces,
    /<button[^>]*className=(?:"task-row"|"event-row"|"money-row"|\{`agenda-item|\{`calendar-item)/,
  );
  assert.match(styles, /\.work-item-open-surface\s*\{[\s\S]*?position: relative/);
  assert.match(styles, /\.work-item-open-target\s*\{[\s\S]*?position: absolute/);
  assert.match(styles, /\.work-item-open-surface \.contact-mention[\s\S]*?pointer-events: auto/);
});

test("overlay item rows render a separate mention button without nesting", () => {
  const script = String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { WorkItemOpenSurface } from "./app/components/work-item-open-surface.tsx";
    import { WorkItemTitle } from "./app/components/work-item-title.tsx";
    const contact = { id: "dana", projectId: "p1", name: "דנה כהן", roleOrCompany: "עורכת דין", email: "dana@example.com", phone: "+97250", notes: "", createdAt: "", updatedAt: "" };
    const item = { title: "Call @דנה כהן", files: [], contactMentions: [{ id: "m1", itemId: "t1", contactId: "dana", field: "title", startOffset: 5, endOffset: 13 }] };
    const html = renderToStaticMarkup(React.createElement(WorkItemOpenSurface, { className: "task-row", label: "Open task", onOpen() {} }, React.createElement(WorkItemTitle, { item, contacts: [contact] })));
    process.stdout.write(html);
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /work-item-open-target/);
  assert.match(result.stdout, /contact-mention-trigger/);
  const openEnd = result.stdout.indexOf("</button>");
  const mentionStart = result.stdout.indexOf("contact-mention-trigger");
  assert.ok(openEnd >= 0 && openEnd < mentionStart, result.stdout);
});
