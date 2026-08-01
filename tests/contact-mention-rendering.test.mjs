import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = new URL("../", import.meta.url);
const actionsSource = await readFile(
  new URL("app/components/contact-actions.tsx", root),
  "utf8",
).catch(() => "");
const mentionSource = await readFile(
  new URL("app/components/mention-text.tsx", root),
  "utf8",
).catch(() => "");
const titleSource = await readFile(
  new URL("app/components/work-item-title.tsx", root),
  "utf8",
);

test("saved Hebrew mentions render by range and missing contacts stay plain", () => {
  const script = String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { MentionText } from "./app/components/mention-text.tsx";

    const text = "התקשר אל @דנה כהן וגם @איש חסר";
    const first = text.indexOf("@דנה כהן");
    const second = text.indexOf("@איש חסר");
    const contacts = [{
      id: "dana", projectId: "project-1", name: "דנה כהן",
      roleOrCompany: "עורכת דין", email: "dana@example.com",
      phone: "+972501234567", notes: "", createdAt: "", updatedAt: "",
    }];
    const mentions = [
      { id: "mention-1", itemId: "task-1", contactId: "dana", field: "title", startOffset: first, endOffset: first + "@דנה כהן".length },
      { id: "mention-2", itemId: "task-1", contactId: "deleted", field: "title", startOffset: second, endOffset: second + "@איש חסר".length },
    ];
    process.stdout.write(renderToStaticMarkup(React.createElement(MentionText, {
      text, field: "title", contacts, mentions,
    })));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /class="mention-text" dir="auto"/);
  assert.match(result.stdout, /<button[^>]*class="contact-mention-trigger"[^>]*>/);
  assert.match(result.stdout, /<bdi dir="auto">@דנה כהן<\/bdi>/);
  assert.match(result.stdout, /<bdi dir="auto">@איש חסר<\/bdi>/);
  assert.equal((result.stdout.match(/contact-mention-trigger/g) ?? []).length, 1);
});

test("contact actions are conditional, dismissible, and read only", () => {
  assert.match(actionsSource, /^"use client";/);
  assert.match(actionsSource, /event\.preventDefault\(\)/);
  assert.match(actionsSource, /event\.stopPropagation\(\)/);
  assert.match(actionsSource, /event\.key === "Escape"/);
  assert.match(actionsSource, /document\.addEventListener\("pointerdown"/);
  assert.match(actionsSource, /document\.removeEventListener\("pointerdown"/);
  assert.match(actionsSource, /triggerRef\.current\?\.focus\(\)/);
  assert.match(actionsSource, /focusMenuItem/);
  assert.match(actionsSource, /event\.key === "ArrowDown"/);
  assert.match(actionsSource, /event\.key === "ArrowUp"/);
  assert.match(actionsSource, /event\.key === "Home"/);
  assert.match(actionsSource, /event\.key === "End"/);
  assert.match(actionsSource, /focusAdjacentControl\(event\.shiftKey\)/);
  assert.match(actionsSource, /\[contenteditable='true'\]/);
  assert.match(actionsSource, /control\.tabIndex >= 0/);
  assert.match(actionsSource, /contact\.phone \? \(/);
  assert.match(actionsSource, /href=\{`tel:\$\{contact\.phone\}`\}/);
  assert.match(actionsSource, /contact\.email \? \(/);
  assert.match(actionsSource, /href=\{`mailto:\$\{contact\.email\}`\}/);
  assert.match(actionsSource, />View contact</);
  assert.match(actionsSource, /<ContactDetailsModal/);
  assert.doesNotMatch(actionsSource, /<input|<textarea|contentEditable/);
});

test("mention rendering is metadata based and shared titles preserve attachments", () => {
  assert.match(mentionSource, /mention\.contactId/);
  assert.doesNotMatch(mentionSource, /contacts\.find\([^\n]*name\s*===/);
  assert.match(titleSource, /Pick<WorkItemRecord, "title" \| "files" \| "contactMentions">/);
  assert.match(titleSource, /<MentionText/);
  assert.match(titleSource, /field="title"/);
  assert.match(titleSource, /item\.files\.length > 0/);
});
