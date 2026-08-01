import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

function runInteractionScript(body) {
  const script = String.raw`
    import React, { act } from "react";
    import { createRoot } from "react-dom/client";
    import { JSDOM } from "jsdom";
    import { FollowUpMenu } from "./app/components/follow-up-menu.tsx";
    import { ItemSheet } from "./app/components/item-sheet.tsx";

    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div><button id='outside'>Outside</button></body></html>", { url: "http://localhost" });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.KeyboardEvent = dom.window.KeyboardEvent;
    globalThis.PointerEvent = dom.window.PointerEvent ?? dom.window.MouseEvent;
    globalThis.MouseEvent = dom.window.MouseEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.requestAnimationFrame = (callback) => setTimeout(callback, 0);
    globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
    const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
    const click = async (element) => {
      await act(async () => {
        element.click();
        await flush();
      });
    };

    ${body}
  `;
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", "--input-type=module", "-e", script],
    {
      cwd: new URL("..", import.meta.url),
      encoding: "utf8",
    },
  );
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout);
}

test("rendered follow-up menu selects both types and consumes Escape", () => {
  const result = runInteractionScript(String.raw`
    const selected = [];
    let sheetEscapeCount = 0;
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") sheetEscapeCount += 1;
    });
    const root = createRoot(document.querySelector("#root"));
    await act(async () => {
      root.render(React.createElement(FollowUpMenu, {
        onSelect(type) { selected.push(type); },
      }));
      await flush();
    });

    const trigger = document.querySelector("[aria-haspopup='menu']");
    await click(trigger);
    const firstFocusedText = document.activeElement?.textContent;
    await click([...document.querySelectorAll("[role='menuitem']")].find((item) => item.textContent === "Task"));
    await click(trigger);
    await click([...document.querySelectorAll("[role='menuitem']")].find((item) => item.textContent === "Event"));
    await click(trigger);
    await act(async () => {
      document.querySelector("#outside").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await flush();
    });
    const outsideClosed = document.querySelector("[role='menu']") === null;
    const outsideFocusRestored = document.activeElement === trigger;
    trigger.focus();
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      await flush();
    });
    const arrowUpFocusedText = document.activeElement?.textContent;
    await act(async () => {
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
    });

    process.stdout.write(JSON.stringify({
      selected,
      firstFocusedText,
      outsideClosed,
      outsideFocusRestored,
      arrowUpFocusedText,
      menuClosed: document.querySelector("[role='menu']") === null,
      focusRestored: document.activeElement === trigger,
      sheetEscapeCount,
    }));
    root.unmount();
  `);

  assert.deepEqual(result, {
    selected: ["task", "event"],
    firstFocusedText: "Task",
    outsideClosed: true,
    outsideFocusRestored: true,
    arrowUpFocusedText: "Task",
    menuClosed: true,
    focusRestored: true,
    sheetEscapeCount: 0,
  });
});

test("task and event sheets dispatch every follow-up destination from the rendered menu", () => {
  const result = runInteractionScript(String.raw`
    const calls = [];
    const baseItem = {
      projectId: "project-1",
      collectionId: "collection-1",
      title: "Source",
      description: "",
      estimatedCostMinor: null,
      actualSpendMinor: 0,
      varianceMinor: null,
      createdBy: "user-1",
      createdByName: "Alex",
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
      files: [],
      payments: [],
      contactLinks: [],
      contactMentions: [],
    };
    const items = [
      { ...baseItem, id: "task-source", type: "task", status: "todo", dueDate: null, occurrenceDate: null },
      { ...baseItem, id: "event-source", type: "event", status: null, dueDate: null, occurrenceDate: "2026-08-01" },
    ];
    const snapshot = {
      user: { id: "user-1", email: "alex@example.com", displayName: "Alex" },
      projects: [{ id: "project-1", ownerUserId: "user-1", name: "Project", description: "", currency: "USD", role: "owner", createdAt: "", updatedAt: "" }],
      members: [], invitations: [], contacts: [],
      collections: [{ id: "collection-1", projectId: "project-1", name: "General", color: "cyan", position: 0, createdAt: "", updatedAt: "" }],
      items, relations: [], generatedAt: "2026-08-01",
    };
    const container = document.querySelector("#root");
    const root = createRoot(container);

    for (const source of items) {
      for (const destination of ["task", "event"]) {
        await act(async () => {
          root.render(React.createElement(ItemSheet, {
            snapshot,
            mode: { kind: "existing", itemId: source.id },
            pending: false,
            uploadProgress: null,
            onClose() {},
            async onMutate() { return snapshot; },
            onOpenItem() {},
            onStartFollowUp(sourceItemId, collectionId, type) {
              calls.push({ sourceItemId, collectionId, type });
            },
            async onUpload() {},
            async onRenameFile() {},
            async onDeleteFile() {},
          }));
          await flush();
        });
        await click([...document.querySelectorAll("button")].find((button) => button.textContent === "Create follow-up"));
        await click([...document.querySelectorAll("[role='menuitem']")].find((item) => item.textContent.toLowerCase() === destination));
      }
    }

    process.stdout.write(JSON.stringify(calls));
    root.unmount();
  `);

  assert.deepEqual(result, [
    { sourceItemId: "task-source", collectionId: "collection-1", type: "task" },
    { sourceItemId: "task-source", collectionId: "collection-1", type: "event" },
    { sourceItemId: "event-source", collectionId: "collection-1", type: "task" },
    { sourceItemId: "event-source", collectionId: "collection-1", type: "event" },
  ]);
});
