import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("work item titles render an accessible paperclip", () => {
  assert.match(titleSource, /Has attached files/);
  assert.match(
    titleSource,
    /className="attachment-indicator"\s+role="img"\s+aria-label="Has attached files"/,
  );
  assert.doesNotMatch(titleSource, /className="sr-only">Has attached files/);
  assert.match(titleSource, /📎/);
  assert.doesNotMatch(titleSource, /files\.length\s*\}/);
});

test("rendered titles show a paperclip for attachments and receipts only", () => {
  const script = String.raw`
    import React from "react";
    import { renderToStaticMarkup } from "react-dom/server";
    import { WorkItemTitle } from "./app/components/work-item-title.tsx";

    const renderTitle = (files, payments) =>
      renderToStaticMarkup(
        React.createElement(WorkItemTitle, {
          item: {
            title: "Task",
            files,
            payments,
            contactMentions: [],
          },
        }),
      );

    process.stdout.write(JSON.stringify([
      renderTitle([{}], []),
      renderTitle([], [{ receiptFileId: "receipt-1" }]),
      renderTitle([], [{ receiptFileId: null }]),
    ]));
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);

  const [ordinaryAttachment, paymentReceipt, paymentWithoutReceipt] =
    JSON.parse(result.stdout);
  assert.match(ordinaryAttachment, /class="attachment-indicator"/);
  assert.match(paymentReceipt, /class="attachment-indicator"/);
  assert.doesNotMatch(paymentWithoutReceipt, /class="attachment-indicator"/);
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
