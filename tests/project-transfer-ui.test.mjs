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

test("project navigation omits currency labels on desktop and mobile", () => {
  const currencyLabels =
    shell.match(/<small>\{project\.currency\}<\/small>/g) ?? [];

  assert.equal(
    currencyLabels.length,
    0,
    "desktop and mobile project navigation must omit currency labels",
  );
  assert.doesNotMatch(styles, /\.project-nav-item small\s*\{/);
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
  assert.match(menu, /window\.dispatchEvent\(/);
  assert.match(menu, /window\.addEventListener\(PROJECT_MENU_OPEN_EVENT/);
  assert.match(menu, /window\.removeEventListener\(PROJECT_MENU_OPEN_EVENT/);
  assert.match(menu, /triggerRef\.current\?\.focus\(\)/);
});

test("owner project menus expose rename and delete actions", () => {
  assert.match(menu, /project\.role === "owner"/);
  assert.match(menu, /Rename project/);
  assert.match(menu, /Delete project/);
  assert.match(menu, /onRename\(project\)/);
  assert.match(menu, /onDelete\(project\)/);
  assert.match(menu, /className="project-menu-danger"/);
});

test("the shell coordinates shared project rename and delete dialogs", () => {
  assert.match(shell, /type ProjectActionDialog/);
  assert.match(shell, /onProjectRename/);
  assert.match(shell, /onProjectDelete/);
  assert.match(shell, /setMobileMoreOpen\(false\)/);
  assert.match(shell, /title="Rename project"/);
  assert.match(
    shell,
    /name="name"[\s\S]*?required[\s\S]*?maxLength=\{120\}/,
  );
  assert.match(shell, /title="Delete project"/);
  assert.match(shell, /className="button button-danger"/);
});

test("project menu actions use existing mutations and clean stale routes", () => {
  assert.match(harbor, /action: "update_project"/);
  assert.match(harbor, /description: project\.description/);
  assert.match(harbor, /action: "delete_project"/);
  assert.match(harbor, /shouldLeaveDeletedProjectRoute/);
  assert.match(harbor, /window\.history\.replaceState\(\{\}, "", "\/"\)/);
  assert.match(harbor, /onProjectRename=\{renameProject\}/);
  assert.match(harbor, /onProjectDelete=\{deleteProject\}/);
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

test("project export menu uses an opaque surface", () => {
  const menuRule =
    styles.match(/\.project-context-menu\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(menuRule, /background:\s*var\(--card\)/);
  assert.doesNotMatch(menuRule, /var\(--panel-strong\)/);
});

test("project menu renders as a viewport-fixed portal", () => {
  assert.match(menu, /import \{ createPortal \} from "react-dom"/);
  assert.match(menu, /calculateProjectMenuPosition/);
  assert.match(menu, /createPortal\([\s\S]*document\.body/);
  assert.match(menu, /window\.addEventListener\("resize", positionMenu\)/);
  assert.match(menu, /window\.addEventListener\("scroll", positionMenu, true\)/);
  assert.match(menu, /menuRef\.current\?\.contains\(target\)/);

  const menuRule =
    styles.match(/\.project-context-menu\s*\{([\s\S]*?)\}/)?.[1] ?? "";
  assert.match(menuRule, /position:\s*fixed/);
  assert.match(menuRule, /z-index:\s*120/);
  assert.match(menuRule, /visibility:\s*hidden/);
  assert.doesNotMatch(menuRule, /position:\s*absolute/);
  assert.doesNotMatch(menuRule, /right:\s*0/);
  assert.doesNotMatch(menuRule, /calc\(100% \+ 5px\)/);
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
