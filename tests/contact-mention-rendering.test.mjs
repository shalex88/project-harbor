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
  assert.match(result.stdout, /class="mention-text" dir="rtl"/);
  assert.match(result.stdout, /<button[^>]*class="contact-mention-trigger"[^>]*>/);
  assert.match(result.stdout, /<bdi dir="auto">עורכת דין<\/bdi>/);
  assert.doesNotMatch(result.stdout, /<bdi dir="auto">@עורכת דין<\/bdi>/);
  assert.doesNotMatch(result.stdout, /<bdi dir="auto">@דנה כהן<\/bdi>/);
  assert.match(result.stdout, /<bdi dir="auto">@איש חסר<\/bdi>/);
  assert.doesNotMatch(result.stdout, /<bdi dir="auto">התקשר אל/);
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
  assert.match(actionsSource, /href=\{messageHref\}/);
  assert.match(actionsSource, /target="_blank"/);
  assert.match(actionsSource, />\s*Message\s*<\/a>/);
  assert.match(actionsSource, /contact\.email \? \(/);
  assert.match(actionsSource, /href=\{`mailto:\$\{contact\.email\}`\}/);
  assert.match(actionsSource, />View contact</);
  assert.match(actionsSource, /<ContactDetailsModal/);
  assert.doesNotMatch(actionsSource, /<input|<textarea|contentEditable/);
});

test("WhatsApp message links normalize local Israeli and international numbers", () => {
  const script = String.raw`
    import { whatsappMessageHref } from "./app/components/contact-actions.tsx";
    process.stdout.write(JSON.stringify([
      whatsappMessageHref("050-666-1753"),
      whatsappMessageHref("+1 (415) 555-2671"),
      whatsappMessageHref("0044 20 7946 0958"),
      whatsappMessageHref("no digits"),
    ]));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), [
    "https://wa.me/972506661753",
    "https://wa.me/14155552671",
    "https://wa.me/442079460958",
    null,
  ]);
});

test("contact details link the displayed phone and email without action buttons", () => {
  const script = String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { ContactDetailsModal } from "./app/components/contact-actions.tsx";

    const contact = {
      id: "dana", projectId: "project-1", name: "דנה כהן",
      roleOrCompany: "עורכת דין", email: "dana@example.com",
      phone: "+972501234567", notes: "", createdAt: "", updatedAt: "",
    };
    process.stdout.write(renderToStaticMarkup(React.createElement(ContactDetailsModal, {
      contact, open: true, onClose() {},
    })));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: new URL("..", import.meta.url), encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(
    result.stdout,
    /<a href="tel:\+972501234567"><bdi dir="ltr">\+972501234567<\/bdi><\/a>/,
  );
  assert.match(
    result.stdout,
    /<a href="mailto:dana@example\.com"><bdi dir="ltr">dana@example\.com<\/bdi><\/a>/,
  );
  assert.doesNotMatch(result.stdout, /class="contact-detail-actions"/);
  assert.doesNotMatch(result.stdout, />Call<\/a>|>Email<\/a>/);
});

test("mention rendering is metadata based and shared titles preserve attachments", () => {
  assert.match(mentionSource, /mention\.contactId/);
  assert.doesNotMatch(mentionSource, /contacts\.find\([^\n]*name\s*===/);
  assert.match(titleSource, /Pick<WorkItemRecord, "title" \| "files" \| "contactMentions">/);
  assert.match(titleSource, /<MentionText/);
  assert.match(titleSource, /field="title"/);
  assert.match(titleSource, /item\.files\.length > 0/);
});
