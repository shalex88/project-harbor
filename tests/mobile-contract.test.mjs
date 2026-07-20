import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("mobile navigation exposes every primary dashboard", async () => {
  const source = await readFile(new URL("app/components/app-shell.tsx", root), "utf8");
  for (const label of ["Overview", "Tasks", "Events", "Timeline", "More"]) {
    assert.match(source, new RegExp(`label: [\"']${label}[\"']`));
  }
  assert.match(source, /aria-label="Mobile navigation"/);
});

test("desktop brand displays the browser-local current date", async () => {
  const source = await readFile(new URL("app/components/app-shell.tsx", root), "utf8");
  assert.match(source, /formatCurrentDate\(new Date\(\)\)/);
  assert.match(source, /className="brand-date"/);
});

test("responsive styles provide bottom navigation and full-screen mobile sheets", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.mobile-nav/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.sheet-panel\s*\{[\s\S]*?width:\s*100%/);
  assert.match(css, /min-height:\s*44px/);
});

test("tablet widths retain primary navigation when the sidebar collapses", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  const tabletStart = css.indexOf("@media (max-width: 980px)");
  const mobileStart = css.indexOf("@media (max-width: 640px)");
  const tablet = css.slice(tabletStart, mobileStart);
  assert.match(tablet, /\.desktop-sidebar[\s\S]*display:\s*none/);
  assert.match(tablet, /\.mobile-nav[\s\S]*display:\s*grid/);
});

test("reduced motion is respected", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
});

test("past agenda groups use gray-only styling", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.agenda-day-past/);
  assert.match(css, /\.agenda-day-past[\s\S]*color:\s*var\(--text-muted\)/);
});

test("relationship actions remain touch sized on mobile", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.relation-actions[\s\S]*min-height:\s*44px/);
  assert.match(css, /\.relation-add-grid/);
});

test("relation metadata wraps in rows and compact calendar cells", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.match(css, /\.row-title small,[\s\S]*?white-space:\s*normal/);
  assert.match(css, /\.calendar-item small[\s\S]*?white-space:\s*normal/);
  assert.match(css, /\.calendar-item[\s\S]*?grid-template-columns/);
});

test("responsive task status styles use readable labels instead of checkboxes", async () => {
  const css = await readFile(new URL("app/globals.css", root), "utf8");
  assert.doesNotMatch(css, /\.task-check/);
  assert.match(css, /\.status-chip-compact/);
  assert.match(css, /\.calendar-item \.status-chip/);
  assert.match(css, /\.agenda-item \.status-chip/);
  assert.match(
    css,
    /\.collection-item-list > button\s*\{[\s\S]*?grid-template-columns:\s*auto\s+minmax\(0,\s*1fr\)\s+16px;/,
  );
  assert.doesNotMatch(css, /\.agenda-item > span\s*\{/);
  assert.match(css, /\.agenda-event > span\s*\{/);
});
