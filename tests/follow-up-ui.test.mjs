import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";

import { followUpCreatedItemMode } from "../app/components/follow-up-result.ts";

function runInteractionScript(body, { animationFrameDelay = 0 } = {}) {
  const script = String.raw`
    import { JSDOM } from "jsdom";

    const dom = new JSDOM("<!doctype html><html><body><div id='root'></div><button id='outside'>Outside</button></body></html>", { url: "http://localhost" });
    globalThis.window = dom.window;
    globalThis.document = dom.window.document;
    globalThis.Node = dom.window.Node;
    globalThis.HTMLElement = dom.window.HTMLElement;
    globalThis.HTMLInputElement = dom.window.HTMLInputElement;
    globalThis.HTMLSelectElement = dom.window.HTMLSelectElement;
    globalThis.HTMLTextAreaElement = dom.window.HTMLTextAreaElement;
    globalThis.Event = dom.window.Event;
    globalThis.FormData = dom.window.FormData;
    globalThis.KeyboardEvent = dom.window.KeyboardEvent;
    globalThis.PointerEvent = dom.window.PointerEvent ?? dom.window.MouseEvent;
    globalThis.MouseEvent = dom.window.MouseEvent;
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.requestAnimationFrame = (callback) =>
      setTimeout(callback, ${animationFrameDelay});
    globalThis.cancelAnimationFrame = (handle) => clearTimeout(handle);
    const ReactModule = await import("react");
    const React = ReactModule.default;
    const { act } = ReactModule;
    const { createRoot } = await import("react-dom/client");
    const { FollowUpMenu } = await import("./app/components/follow-up-menu.tsx");
    const { ItemSheet } = await import("./app/components/item-sheet.tsx");
    const flush = () => new Promise((resolve) => setTimeout(resolve, 5));
    const waitFor = async (condition, description, timeoutMs = 1000) => {
      const startedAt = Date.now();
      while (!condition()) {
        if (Date.now() - startedAt >= timeoutMs) {
          throw new Error("Timed out waiting for " + description);
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    };
    const click = async (element) => {
      await act(async () => {
        element.click();
        await flush();
      });
    };
    const changeValue = async (element, value) => {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(
          Object.getPrototypeOf(element),
          "value",
        ).set;
        setter.call(element, value);
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.dispatchEvent(new Event("input", { bubbles: true }));
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
    await waitFor(
      () => document.activeElement?.textContent === "Task",
      "the first follow-up choice to receive focus",
    );
    const firstFocusedText = document.activeElement?.textContent;
    await click([...document.querySelectorAll("[role='menuitem']")].find((item) => item.textContent === "Task"));
    await click(trigger);
    await click([...document.querySelectorAll("[role='menuitem']")].find((item) => item.textContent === "Event"));
    await click(trigger);
    await act(async () => {
      document.querySelector("#outside").dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
      await flush();
    });
    await waitFor(
      () => document.querySelector("[role='menu']") === null && document.activeElement === trigger,
      "outside dismissal to restore trigger focus",
    );
    const outsideClosed = document.querySelector("[role='menu']") === null;
    const outsideFocusRestored = document.activeElement === trigger;
    trigger.focus();
    await act(async () => {
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowUp", bubbles: true }));
      await flush();
    });
    await waitFor(
      () => document.activeElement?.textContent === "Task",
      "Arrow Up opening to focus the first choice",
    );
    const arrowUpFocusedText = document.activeElement?.textContent;
    await act(async () => {
      document.activeElement.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await flush();
    });
    await waitFor(
      () => document.querySelector("[role='menu']") === null && document.activeElement === trigger,
      "Escape dismissal to restore trigger focus",
    );

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
  `, { animationFrameDelay: 25 });

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

test("rendered follow-up forms submit destination fields and contact state", () => {
  const result = runInteractionScript(String.raw`
    const mutations = [];
    const baseItem = {
      projectId: "project-1", collectionId: "collection-1",
      title: "Source", description: "", estimatedCostMinor: null,
      actualSpendMinor: 0, varianceMinor: null,
      createdBy: "user-1", createdByName: "Alex",
      createdAt: "2026-08-01", updatedAt: "2026-08-01",
      files: [], payments: [], contactLinks: [], contactMentions: [],
    };
    const snapshot = {
      user: { id: "user-1", email: "alex@example.com", displayName: "Alex" },
      projects: [{ id: "project-1", ownerUserId: "user-1", name: "Project", description: "", currency: "USD", role: "owner", createdAt: "", updatedAt: "" }],
      members: [], invitations: [],
      contacts: [{ id: "contact-1", projectId: "project-1", name: "Dana", roleOrCompany: "Partner", email: "", phone: "", notes: "", createdAt: "", updatedAt: "" }],
      collections: [{ id: "collection-1", projectId: "project-1", name: "General", color: "cyan", position: 0, createdAt: "", updatedAt: "" }],
      items: [
        { ...baseItem, id: "task-source", type: "task", status: "todo", dueDate: null, occurrenceDate: null },
        { ...baseItem, id: "event-source", type: "event", status: null, dueDate: null, occurrenceDate: "2026-08-01" },
      ],
      relations: [], generatedAt: "2026-08-01",
    };
    const root = createRoot(document.querySelector("#root"));
    const cases = [
      { sourceItemId: "event-source", type: "task", title: "Follow-up task", dateName: "dueDate", date: "2026-08-20" },
      { sourceItemId: "task-source", type: "event", title: "Follow-up event", dateName: "occurrenceDate", date: "2026-08-21" },
    ];

    for (const entry of cases) {
      await act(async () => {
        root.render(React.createElement(ItemSheet, {
          snapshot,
          mode: { kind: "follow-up", sourceItemId: entry.sourceItemId, type: entry.type, collectionId: "collection-1" },
          pending: false,
          uploadProgress: null,
          onClose() {},
          async onMutate(mutation) { mutations.push(mutation); return snapshot; },
          onOpenItem() {}, onStartFollowUp() {},
          async onUpload() {}, async onRenameFile() {}, async onDeleteFile() {},
        }));
        await flush();
      });
      const collection = document.querySelector("select[name='collectionId']");
      if (collection.value !== "collection-1") throw new Error("source collection was not selected");
      await changeValue(document.querySelector("[aria-label='Title']"), entry.title);
      await changeValue(document.querySelector("#work-item-contact-select"), "contact-1");
      await changeValue(
        document.querySelector("[name='" + entry.dateName + "']"),
        entry.date,
      );
      await click(
        [...document.querySelectorAll("button")].find(
          (button) => button.textContent === "Create " + entry.type,
        ),
      );
    }

    process.stdout.write(JSON.stringify(mutations));
    root.unmount();
  `);

  assert.deepEqual(result, [
    {
      action: "create_follow_up_item",
      sourceItemId: "event-source",
      collectionId: "collection-1",
      type: "task",
      title: "Follow-up task",
      description: "",
      status: "todo",
      dueDate: "2026-08-20",
      estimatedCostMinor: null,
      manualContactIds: ["contact-1"],
      contactMentions: [],
    },
    {
      action: "create_follow_up_item",
      sourceItemId: "task-source",
      collectionId: "collection-1",
      type: "event",
      title: "Follow-up event",
      description: "",
      occurrenceDate: "2026-08-21",
      estimatedCostMinor: null,
      manualContactIds: ["contact-1"],
      contactMentions: [],
    },
  ]);
});

test("created follow-up results open the returned item", () => {
  assert.deepEqual(
    followUpCreatedItemMode("create_follow_up_item", "created-item"),
    { kind: "existing", itemId: "created-item" },
  );
  assert.equal(followUpCreatedItemMode("create_item", "created-item"), null);
  assert.equal(followUpCreatedItemMode("create_follow_up_item", null), null);
});
