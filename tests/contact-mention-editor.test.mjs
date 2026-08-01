import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const editorSource = await readFile(
  new URL("app/components/contact-mention-editor.tsx", root),
  "utf8",
).catch(() => "");
const selectorSource = await readFile(
  new URL("app/components/work-item-contact-selector.tsx", root),
  "utf8",
).catch(() => "");

test("mention editor exposes a bidi-safe structured textbox", () => {
  const script = String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { ContactMentionEditor } from "./app/components/contact-mention-editor.tsx";
    const contact = { id: "dana", projectId: "p1", name: "דנה כהן", roleOrCompany: "עורכת דין", email: "", phone: "", notes: "", createdAt: "", updatedAt: "" };
    const value = { text: "התקשר אל @דנה כהן", mentions: [{ contactId: "dana", startOffset: 9, endOffset: 17 }] };
    process.stdout.write(renderToStaticMarkup(React.createElement(ContactMentionEditor, { label: "Title", value, contacts: [contact], multiline: false, maxLength: 160, onChange() {} })));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /role="combobox"/);
  assert.match(result.stdout, /role="textbox"/);
  assert.match(result.stdout, /contentEditable="true"/);
  assert.match(result.stdout, /dir="auto"/);
  assert.match(result.stdout, /aria-multiline="false"/);
  assert.match(result.stdout, /data-contact-id="dana"/);
  assert.match(result.stdout, /<bdi dir="auto">@דנה כהן<\/bdi>/);
});

test("mention picker implements keyboard, paste, and composition behavior", () => {
  assert.match(editorSource, /role="listbox"/);
  assert.match(editorSource, /aria-activedescendant/);
  for (const key of [
    "ArrowDown",
    "ArrowUp",
    "Enter",
    "Escape",
    "Backspace",
    "Delete",
  ]) {
    assert.match(editorSource, new RegExp(`event\\.key === "${key}"`));
  }
  assert.match(editorSource, /onPaste=/);
  assert.match(editorSource, /getData\("text\/plain"\)/);
  assert.match(editorSource, /onCompositionStart=/);
  assert.match(editorSource, /onCompositionEnd=/);
  assert.match(editorSource, /isComposing\.current/);
  assert.match(editorSource, /rankMentionContacts\(contacts/);
  assert.match(editorSource, /<bdi dir="auto">\{contact\.name\}<\/bdi>/);
  assert.match(editorSource, /<bdi dir="auto">\{contact\.roleOrCompany\}<\/bdi>/);
  assert.match(editorSource, /No matching contacts/);
});

test("manual selector deduplicates chips and delegates metadata-only removal", () => {
  assert.match(selectorSource, /manualContactIds/);
  assert.match(selectorSource, /mentionedContactIds/);
  assert.match(selectorSource, /new Set\(\[\.\.\.manualContactIds, \.\.\.mentionedContactIds\]\)/);
  assert.match(selectorSource, /onManualContactIdsChange\(\[\.\.\.manualContactIds, contactId\]\)/);
  assert.match(selectorSource, /onRemoveContact\(contact\.id\)/);
  assert.match(selectorSource, /<ContactActionTrigger/);
  assert.match(selectorSource, /<bdi dir="auto">\{contact\.roleOrCompany\}<\/bdi>/);

  const script = String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { WorkItemContactSelector } from "./app/components/work-item-contact-selector.tsx";
    const contact = { id: "dana", projectId: "p1", name: "דנה כהן", roleOrCompany: "עורכת דין", email: "", phone: "", notes: "", createdAt: "", updatedAt: "" };
    process.stdout.write(renderToStaticMarkup(React.createElement(WorkItemContactSelector, { contacts: [contact], manualContactIds: ["dana"], mentionedContactIds: ["dana"], onManualContactIdsChange() {}, onRemoveContact() {} })));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal((result.stdout.match(/class="contact-chip"/g) ?? []).length, 1);
});

test("removing a linked contact preserves visible text through the pure helper", () => {
  assert.match(selectorSource, /onRemoveContact/);
  assert.match(editorSource, /reconcileMentionText/);
  assert.doesNotMatch(selectorSource, /replace\([^\n]*contact\.name/);
});
