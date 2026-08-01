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
const harborApp = await readFile(
  new URL("../app/components/harbor-app.tsx", import.meta.url),
  "utf8",
);
const shell = await readFile(
  new URL("../app/components/app-shell.tsx", import.meta.url),
  "utf8",
);
const contactsPage = await readFile(
  new URL("../app/contacts/page.tsx", import.meta.url),
  "utf8",
).catch(() => "");

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
  assert.match(styles, /\.contact-card-heading > div[\s\S]*?min-width:\s*0/);
  assert.match(styles, /\.contact-card-heading h3[\s\S]*?overflow-wrap:\s*anywhere/);
  assert.match(styles, /\.contact-actions \.button[\s\S]*?min-height:\s*44px/);
});

test("contacts has a first-class route and aggregate workspace", () => {
  assert.match(shell, /export type AppRoute = [^;]*"contacts"/);
  assert.match(contactsPage, /initialRoute="contacts"/);
  assert.match(contactsPage, /returnTo="\/contacts"/);
  assert.match(directory, /export function ContactsWorkspace/);
  assert.match(directory, /showProject/);
  assert.match(harborApp, /route === "contacts"/);
  assert.match(harborApp, /<ContactsWorkspace/);
  assert.match(harborApp, /segments\[0\] === "contacts"/);
});

test("contact dialogs use fixed fields and strict mutations", () => {
  assert.match(harborApp, /type ContactDialogState/);
  assert.match(harborApp, /kind: "create"; projectId: string/);
  assert.match(harborApp, /kind: "edit"; contact: ContactRecord/);
  assert.match(harborApp, /kind: "delete"; contact: ContactRecord/);
  for (const [name, maximum] of [
    ["name", 160],
    ["roleOrCompany", 160],
    ["email", 254],
    ["phone", 80],
    ["notes", 2000],
  ]) {
    assert.match(
      harborApp,
      new RegExp(`name=["']${name}["'][\\s\\S]*?maxLength=\\{${maximum}\\}`),
    );
  }
  assert.match(harborApp, /action: "create_contact"/);
  assert.match(harborApp, /action: "update_contact"/);
  assert.match(harborApp, /action: "delete_contact"/);
  assert.match(harborApp, /Delete contact/);
  assert.match(harborApp, /<select[\s\S]*?name="projectId"/);
});

test("project contact actions are wired to the shared dialogs", () => {
  assert.match(harborApp, /onCreateContact=\{openProjectContactCreate\}/);
  assert.match(harborApp, /onEditContact=\{openContactEdit\}/);
  assert.match(harborApp, /onDeleteContact=\{openContactDelete\}/);
});
