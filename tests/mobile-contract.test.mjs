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
