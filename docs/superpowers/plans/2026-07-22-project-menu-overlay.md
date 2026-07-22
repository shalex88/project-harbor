# Project Menu Overlay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render each project export menu as a viewport-aware overlay that never scrolls, clips, narrows, or moves the project list.

**Architecture:** A small pure positioning helper calculates clamped fixed coordinates from trigger geometry, menu size, and viewport size. `ProjectMenu` renders the menu through a React DOM portal, measures and repositions it on layout/scroll/resize, and preserves the existing accessible interaction model. CSS owns only the fixed surface and stacking layer; React owns coordinates.

**Tech Stack:** TypeScript 5.9, React 19, React DOM 19, Next 16/Vinext, CSS custom properties, Node test runner, Playwright CLI for rendered verification.

## Global Constraints

- The menu must not consume layout space or change the project list’s scroll position.
- Default trigger gap: 6px. Default viewport margin: 8px.
- Prefer placement below the trigger; flip above when below would cross the bottom margin.
- Right-align to the trigger and clamp on every viewport edge.
- Use `z-index: 120`, above the existing overlay layer’s `z-index: 100`.
- Preserve the opaque `--card` background, border, shadow, icon, typography, and 44px minimum action height.
- Preserve outside-click dismissal, Escape dismissal with trigger-focus restoration, arrow-key navigation, autofocus, busy state, and export behavior.
- Apply the same behavior in the desktop sidebar and mobile More sheet.
- Do not change project data, import/export APIs, project rows, or project-list overflow behavior.

---

## File Structure

- `app/components/project-menu-position.ts`: pure viewport placement calculation.
- `app/components/project-menu.tsx`: portal rendering, measurement, event containment, focus, and repositioning.
- `app/globals.css`: fixed overlay positioning and stacking surface.
- `tests/project-menu-position.test.mjs`: numeric placement edge cases.
- `tests/project-transfer-ui.test.mjs`: portal, containment, fixed-style, and accessibility contracts.

---

### Task 1: Pure project-menu positioning

**Files:**
- Create: `tests/project-menu-position.test.mjs`
- Create: `app/components/project-menu-position.ts`

**Interfaces:**
- Produces: `ProjectMenuPositionInput` and `calculateProjectMenuPosition(input): { top: number; left: number }`.
- Consumed by: `ProjectMenu` in Task 2.

- [ ] **Step 1: Write the failing positioning tests**

Create `tests/project-menu-position.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";

import { calculateProjectMenuPosition } from "../app/components/project-menu-position.ts";

const base = {
  trigger: { top: 20, right: 200, bottom: 64 },
  menu: { width: 174, height: 56 },
  viewport: { width: 1200, height: 800 },
};

test("right-aligns the menu below its trigger", () => {
  assert.deepEqual(calculateProjectMenuPosition(base), { top: 70, left: 26 });
});

test("flips the menu above when it would cross the bottom margin", () => {
  assert.deepEqual(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 700, right: 200, bottom: 744 },
    }),
    { top: 638, left: 26 },
  );
});

test("clamps the menu inside the horizontal viewport margins", () => {
  assert.equal(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 20, right: 150, bottom: 64 },
    }).left,
    8,
  );
  assert.equal(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 20, right: 1200, bottom: 64 },
    }).left,
    1018,
  );
});

test("clamps vertical placement in a viewport smaller than the menu", () => {
  assert.equal(
    calculateProjectMenuPosition({
      ...base,
      trigger: { top: 3, right: 200, bottom: 47 },
      menu: { width: 174, height: 90 },
      viewport: { width: 1200, height: 80 },
    }).top,
    8,
  );
});
```

- [ ] **Step 2: Run the test and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-menu-position.test.mjs
```

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `project-menu-position.ts`.

- [ ] **Step 3: Implement the minimal placement helper**

Create `app/components/project-menu-position.ts`:

```ts
export type ProjectMenuPositionInput = {
  trigger: { top: number; right: number; bottom: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
  gap?: number;
  margin?: number;
};

export function calculateProjectMenuPosition({
  trigger,
  menu,
  viewport,
  gap = 6,
  margin = 8,
}: ProjectMenuPositionInput): { top: number; left: number } {
  const maximumLeft = Math.max(margin, viewport.width - menu.width - margin);
  const left = Math.min(
    Math.max(trigger.right - menu.width, margin),
    maximumLeft,
  );
  const below = trigger.bottom + gap;
  const above = trigger.top - gap - menu.height;
  const preferredTop =
    below + menu.height <= viewport.height - margin ? below : above;
  const maximumTop = Math.max(margin, viewport.height - menu.height - margin);
  const top = Math.min(Math.max(preferredTop, margin), maximumTop);
  return { top, left };
}
```

- [ ] **Step 4: Run the positioning tests**

Run the command from Step 2. Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add app/components/project-menu-position.ts tests/project-menu-position.test.mjs
git commit -m "feat: calculate project menu overlay placement"
```

---

### Task 2: Portaled project action menu

**Files:**
- Modify: `tests/project-transfer-ui.test.mjs`
- Modify: `app/components/project-menu.tsx`
- Modify: `app/globals.css:181-244`

**Interfaces:**
- Consumes: `calculateProjectMenuPosition` from Task 1 and `createPortal` from `react-dom`.
- Produces: the existing `ProjectMenu` props and accessible menu interface with viewport-fixed rendering.

- [ ] **Step 1: Write failing portal and style contract tests**

Extend `tests/project-transfer-ui.test.mjs`:

```js
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
```

- [ ] **Step 2: Run the UI contract test and verify failure**

Run:

```bash
node --experimental-strip-types --test tests/project-transfer-ui.test.mjs
```

Expected: FAIL because `ProjectMenu` does not use a portal and the menu CSS is absolute.

- [ ] **Step 3: Implement portal rendering and fixed placement**

In `app/components/project-menu.tsx`, import `useLayoutEffect`, `createPortal`,
and `calculateProjectMenuPosition`. Add this layout effect after the refs:

```ts
useLayoutEffect(() => {
  if (!open) return;
  const positionMenu = () => {
    const trigger = triggerRef.current;
    const menu = menuRef.current;
    if (!trigger || !menu) return;
    const triggerRect = trigger.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const position = calculateProjectMenuPosition({
      trigger: triggerRect,
      menu: menuRect,
      viewport: { width: window.innerWidth, height: window.innerHeight },
    });
    menu.style.top = `${position.top}px`;
    menu.style.left = `${position.left}px`;
    menu.style.visibility = "visible";
  };
  positionMenu();
  window.addEventListener("resize", positionMenu);
  window.addEventListener("scroll", positionMenu, true);
  return () => {
    window.removeEventListener("resize", positionMenu);
    window.removeEventListener("scroll", positionMenu, true);
  };
}, [open]);
```

Update outside-pointer containment:

```ts
const target = event.target as Node;
if (
  !containerRef.current?.contains(target) &&
  !menuRef.current?.contains(target)
) {
  close();
}
```

Assign the open menu JSX to `menuContent`, keep the existing ID, roles,
keyboard handler, button, and export callback unchanged, and render it after
the trigger with:

```tsx
{menuContent ? createPortal(menuContent, document.body) : null}
```

- [ ] **Step 4: Change the menu surface to fixed positioning**

Change `.project-context-menu` in `app/globals.css` to:

```css
.project-context-menu {
  position: fixed;
  z-index: 120;
  top: 0;
  left: 0;
  visibility: hidden;
  width: max-content;
  min-width: 174px;
  border: 1px solid var(--border-bright);
  border-radius: 8px;
  background: var(--card);
  box-shadow: var(--shadow);
  padding: 5px;
}
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
node --experimental-strip-types --test tests/project-menu-position.test.mjs tests/project-transfer-ui.test.mjs
```

Expected: all focused tests pass.

- [ ] **Step 6: Commit**

```bash
git add app/components/project-menu.tsx app/globals.css tests/project-transfer-ui.test.mjs
git commit -m "fix: float project menus above sidebar content"
```

---

### Task 3: Rendered layout regression

**Files:**
- No repository files.

**Interfaces:**
- Consumes: the running local app at `http://localhost:5173` and the completed Tasks 1–2 behavior.
- Produces: direct geometry, focus, stacking, and opacity evidence for the reported visual defect.

- [ ] **Step 1: Open a project page with exactly two visible projects**

Use Playwright CLI with the existing local development server. If the local
workspace has more than two projects, temporarily hide later rows in the
browser page only; do not mutate project data.

- [ ] **Step 2: Record the closed-state geometry**

Read `.project-nav.scrollTop`, `.project-nav.scrollHeight`, the Projects heading
rectangle, and both visible `.project-nav-row` rectangles. Expected:
`scrollTop` is 0 and all rectangles are fully inside the project-nav viewport.

- [ ] **Step 3: Open the second menu and compare geometry**

Activate the second `More actions for …` button and re-read the same values.
Expected: `scrollTop`, `scrollHeight`, heading rectangle, and row rectangles are
unchanged. The menu rectangle is outside the list’s layout and fully within the
viewport.

- [ ] **Step 4: Verify visual and interaction details**

Read computed styles and accessibility state. Expected: background
`rgb(18, 34, 53)`, opacity `1`, z-index `120`, the Export menuitem has focus,
Escape closes the menu and restores trigger focus, and the menu is visible over
the mobile More sheet.

---

### Task 4: Full verification and branch handoff

**Files:**
- No new files.

**Interfaces:**
- Consumes: all prior task outputs.
- Produces: fresh evidence that the visual correction is complete and ready for integration.

- [ ] **Step 1: Run lint**

```bash
npm run lint
```

Expected: exit code 0.

- [ ] **Step 2: Run the complete suite and verified production build**

```bash
npm test
```

Expected: the Vinext production build and artifact validation succeed and all
tests pass with zero failures.

- [ ] **Step 3: Run artifact validation directly**

```bash
npm run validate:artifact
```

Expected: `Validated Sites artifact: ESM Worker default.fetch and hosting manifest are present.`

- [ ] **Step 4: Inspect the final branch**

```bash
git diff --check
git status --short --branch
git log -7 --oneline --decorate
```

Expected: no uncommitted files and all menu-overlay commits are on
`codex/project-import-export`.
