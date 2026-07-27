import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const titleSource = await readFile(
  new URL("app/components/work-item-title.tsx", root),
  "utf8",
);
const css = await readFile(new URL("app/globals.css", root), "utf8");
const itemSheet = await readFile(
  new URL("app/components/item-sheet.tsx", root),
  "utf8",
);

test("attachment title layout keeps the icon physically left and the text direction automatic", () => {
  assert.match(titleSource, /className="work-item-title-text" dir="auto"/);
  assert.match(css, /strong\.work-item-title\s*\{[\s\S]*?direction:\s*ltr/);
  assert.match(
    css,
    /\.attachment-indicator\s*\{[\s\S]*?color:\s*var\(--text-muted\)/,
  );
  assert.match(
    css,
    /\.calendar-item \.work-item-title-text[\s\S]*?white-space:\s*normal/,
  );
});

test("the attachment picker advertises the actual 5 MB maximum", () => {
  assert.match(itemSheet, /up to 5 MB/);
  assert.doesNotMatch(itemSheet, /up to 25 MB/);
});
