import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";

const headerActionsModule = await import("../app/components/header-actions.ts");
const { headerActionsForRoute } = headerActionsModule;

test("timeline offers task creation before event creation", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(headerActionsForRoute("timeline"), {
    secondary: "task",
    primary: "event",
  });
});

test("spending offers no creation actions", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(headerActionsForRoute("spending"), {});
});

test("other routes preserve their existing primary creation action", () => {
  assert.equal(
    typeof headerActionsForRoute,
    "function",
    "headerActionsForRoute must exist",
  );
  assert.deepEqual(
    Object.fromEntries(
      ["overview", "tasks", "events", "project"].map((route) => [
        route,
        headerActionsForRoute(route),
      ]),
    ),
    {
      overview: { primary: "project" },
      tasks: { primary: "task" },
      events: { primary: "event" },
      project: { primary: "task" },
    },
  );
});

test("timeline task and event actions use the same primary button design", () => {
  const renderScript = `
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { AppShell } from "./app/components/app-shell.tsx";

    const noop = () => {};
    const asyncNoop = async () => {};
    const html = renderToStaticMarkup(React.createElement(AppShell, {
      user: {
        id: "user-1",
        displayName: "Alex Smith",
        email: "alex@example.com",
      },
      projects: [],
      route: "timeline",
      activeProjectId: null,
      title: "Timeline",
      primaryAction: { label: "New event", onClick: noop },
      secondaryAction: { label: "New task", onClick: noop },
      onRouteChange: noop,
      onProjectSelect: noop,
      onProjectRename: asyncNoop,
      onProjectExport: asyncNoop,
      onProjectDelete: asyncNoop,
      exportingProjectId: null,
      projectMutationPending: false,
    }, null));

    process.stdout.write(html);
  `;
  const html = execFileSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", renderScript],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  const headerStart = html.indexOf('<div class="header-actions">');
  const headerEnd = html.indexOf('<main class="workspace-main">');
  assert.notEqual(
    headerStart,
    -1,
    "rendered shell must include the header actions container",
  );
  assert.notEqual(
    headerEnd,
    -1,
    "rendered shell must include the workspace main marker",
  );
  assert.ok(
    headerStart < headerEnd,
    "header actions must render before the workspace main content",
  );
  const header = html.slice(headerStart, headerEnd);
  const actionClasses = [
    ...header.matchAll(
      /<button class="([^"]+)" type="button">\+ (?:New task|New event)<\/button>/g,
    ),
  ].map((match) => match[1]);

  assert.deepEqual(actionClasses, [
    "button button-primary",
    "button button-primary",
  ]);
});
