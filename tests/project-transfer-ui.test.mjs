import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const shell = await readFile(
  new URL("app/components/app-shell.tsx", root),
  "utf8",
);
const harbor = await readFile(
  new URL("app/components/harbor-app.tsx", root),
  "utf8",
);
const menu = await readFile(
  new URL("app/components/project-menu.tsx", root),
  "utf8",
).catch(() => "");
const styles = await readFile(new URL("app/globals.css", root), "utf8");

test("desktop and mobile project rows expose separate export menus", () => {
  assert.ok(menu.length > 0, "project menu component must exist");
  assert.match(shell, /import \{ ProjectMenu \} from "\.\/project-menu"/);
  assert.match(shell, /className="project-nav-row"/);
  assert.match(shell, /className="mobile-project-row"/);
  assert.match(shell, /<ProjectMenu[\s\S]*?project=\{project\}/);
  assert.match(shell, /onProjectExport/);
  assert.match(menu, /Export project/);
  assert.match(menu, /aria-label={`More actions for \$\{project\.name\}`}/);
});

test("project menus expose accessible semantics and keyboard behavior", () => {
  assert.match(menu, /aria-haspopup="menu"/);
  assert.match(menu, /aria-expanded=\{open\}/);
  assert.match(menu, /role="menu"/);
  assert.match(menu, /role="menuitem"/);
  assert.match(menu, /event\.key === "ArrowDown"/);
  assert.match(menu, /event\.key === "ArrowUp"/);
  assert.match(menu, /event\.key === "Escape"/);
  assert.match(menu, /document\.addEventListener\("pointerdown"/);
  assert.match(menu, /triggerRef\.current\?\.focus\(\)/);
});

test("export fetches the project archive and triggers a browser download", () => {
  assert.match(
    harbor,
    /`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/archive`/,
  );
  assert.match(harbor, /URL\.createObjectURL/);
  assert.match(harbor, /link\.download/);
  assert.match(harbor, /URL\.revokeObjectURL/);
  assert.match(harbor, /exportingProjectId/);
  assert.match(harbor, /Unable to export project/);
});

test("project menu styles preserve navigation and touch target behavior", () => {
  assert.match(styles, /\.project-nav-row/);
  assert.match(styles, /\.project-menu-trigger/);
  assert.match(styles, /\.project-context-menu/);
  assert.match(styles, /\.mobile-project-row/);
  assert.match(styles, /min-(?:width|height):\s*44px/);
});

test("new project dialog imports Harbor archives as independent projects", () => {
  assert.match(harbor, /Import project/);
  assert.match(harbor, /Choose project archive/);
  assert.match(
    harbor,
    /accept="\.harbor\.zip,\.zip,application\/zip"/,
  );
  assert.match(harbor, /fetch\("\/api\/projects\/import"/);
  assert.match(harbor, /headers: \{ "Content-Type": "application\/zip" \}/);
  assert.match(harbor, /acceptSnapshot\(data\.snapshot\)/);
  assert.match(harbor, /setActiveProjectId\(data\.projectId\)/);
  assert.match(harbor, /Project imported/);
  assert.match(harbor, /Importing…/);
  assert.match(harbor, /type="file"\s+hidden/);
  assert.match(styles, /\.project-import-section/);
});

test("import flow retains retry access and suppresses duplicate submissions", () => {
  assert.match(harbor, /setImporting\(true\)/);
  assert.match(harbor, /setImporting\(false\)/);
  assert.match(harbor, /importInputRef\.current\.value = ""/);
  assert.match(harbor, /disabled=\{pending \|\| importing\}/);
  assert.match(harbor, /onClose=\{\(\) => \{[\s\S]*?if \(!importing\)/);
  assert.match(harbor, /Unable to import project/);
});
