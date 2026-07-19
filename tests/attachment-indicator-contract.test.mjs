import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);
const titleSource = await readFile(
  new URL("app/components/work-item-title.tsx", root),
  "utf8",
).catch(() => "");
const dashboardSource = await readFile(
  new URL("app/components/dashboards.tsx", root),
  "utf8",
).catch(() => "");
const projectSource = await readFile(
  new URL("app/components/project-workspace.tsx", root),
  "utf8",
).catch(() => "");

test("work item titles show an accessible paperclip only for attached files", () => {
  assert.match(titleSource, /item\.files\.length\s*>\s*0/);
  assert.match(titleSource, /Has attached files/);
  assert.match(titleSource, /📎/);
  assert.doesNotMatch(titleSource, /files\.length\s*\}/);
});

test("every global dashboard work-item title uses the shared indicator", () => {
  assert.match(
    dashboardSource,
    /function TaskRow[\s\S]*?<WorkItemTitle item=\{item\}/,
  );
  assert.match(
    dashboardSource,
    /function EventRow[\s\S]*?<WorkItemTitle item=\{item\}/,
  );
  assert.match(
    dashboardSource,
    /agenda-item[\s\S]*?<WorkItemTitle item=\{item\}/,
  );
  assert.match(
    dashboardSource,
    /calendar-item[\s\S]*?<WorkItemTitle item=\{item\}/,
  );
  assert.match(
    dashboardSource,
    /money-row[\s\S]*?<WorkItemTitle item=\{item\}/,
  );
});

test("project collection task and event titles use the shared indicator", () => {
  assert.match(projectSource, /tasks\.map[\s\S]*?<WorkItemTitle item=\{task\}/);
  assert.match(projectSource, /events\.map[\s\S]*?<WorkItemTitle item=\{event\}/);
});
