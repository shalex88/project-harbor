import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const directory = await readFile(
  new URL("../app/components/contact-directory.tsx", import.meta.url),
  "utf8",
).catch(() => "");
const projectWorkspace = await readFile(
  new URL("../app/components/project-workspace.tsx", import.meta.url),
  "utf8",
);
const styles = await readFile(
  new URL("../app/globals.css", import.meta.url),
  "utf8",
);

test("shared contact cards expose project, communication, and management details", () => {
  assert.ok(directory.length > 0, "contact directory component must exist");
  assert.match(directory, /export function ContactGrid/);
  assert.match(directory, /showProject/);
  assert.match(directory, /contact\.roleOrCompany/);
  assert.match(directory, /contact\.notes/);
  assert.match(directory, /href=\{`mailto:\$\{contact\.email\}`\}/);
  assert.match(directory, /href=\{`tel:\$\{contact\.phone\}`\}/);
  assert.match(directory, /onEdit\(contact\)/);
  assert.match(directory, /onDelete\(contact\)/);
  assert.match(directory, /No contacts yet/);
});

test("project pages show only their contacts before the members section", () => {
  assert.match(
    projectWorkspace,
    /const contacts = snapshot\.contacts\.filter\([\s\S]*?contact\.projectId === projectId/,
  );
  assert.match(projectWorkspace, /className="contact-section"/);
  assert.match(projectWorkspace, />Contacts<\/h2>/);
  assert.match(projectWorkspace, /\+ New contact/);
  assert.match(projectWorkspace, /<ContactGrid/);
  assert.ok(
    projectWorkspace.indexOf('className="contact-section"') <
      projectWorkspace.indexOf('className="people-section"'),
  );
});

test("contact cards collapse from three columns to one without clipping", () => {
  assert.match(
    styles,
    /\.contact-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/,
  );
  const tablet = styles.slice(
    styles.indexOf("@media (max-width: 980px)"),
    styles.indexOf("@media (max-width: 640px)"),
  );
  assert.match(tablet, /\.contact-grid[\s\S]*?repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
  const mobile = styles.slice(styles.indexOf("@media (max-width: 640px)"));
  assert.match(mobile, /\.contact-grid[\s\S]*?grid-template-columns:\s*1fr/);
  assert.match(styles, /\.contact-details a[\s\S]*?overflow-wrap:\s*anywhere/);
});
