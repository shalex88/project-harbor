# Sidebar Current Date Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display the viewer's current local date beneath `Project Harbor` in the desktop sidebar brand.

**Architecture:** Add a pure date-formatting helper for deterministic unit coverage. Let `AppShell` set the formatted date after hydration, then render it in a two-line brand text block styled by focused sidebar classes.

**Tech Stack:** React 19, TypeScript 5.9, CSS, Node test runner, `Intl.DateTimeFormat`.

## Global Constraints

- Use the long English format `Thursday, July 16, 2026`.
- Use the viewer's browser-local calendar date.
- Preserve the existing desktop brand button navigation behavior.
- Keep the mobile header unchanged.
- Avoid server/client hydration mismatches.

---

## File Map

- `app/components/current-date.ts` — pure long-date formatter.
- `app/components/app-shell.tsx` — post-hydration current-date state and desktop brand markup.
- `app/globals.css` — two-line brand presentation.
- `tests/current-date.test.mjs` — deterministic formatter unit test.
- `tests/mobile-contract.test.mjs` — desktop-brand integration contract.

### Task 1: Current-date formatter and sidebar integration

**Files:**
- Create: `app/components/current-date.ts`
- Create: `tests/current-date.test.mjs`
- Modify: `tests/mobile-contract.test.mjs`
- Modify: `app/components/app-shell.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Produces: `formatCurrentDate(date: Date): string`.
- Consumes: the formatter from `AppShell` after client hydration.

- [ ] **Step 1: Write the failing tests**

Create `tests/current-date.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { formatCurrentDate } from "../app/components/current-date.ts";

test("formats the current date in long English form", () => {
  const date = new Date(2026, 6, 16, 12);
  assert.equal(formatCurrentDate(date), "Thursday, July 16, 2026");
});
```

Append to `tests/mobile-contract.test.mjs`:

```js
test("desktop brand displays the browser-local current date", async () => {
  const source = await readFile(new URL("app/components/app-shell.tsx", root), "utf8");
  assert.match(source, /formatCurrentDate\(new Date\(\)\)/);
  assert.match(source, /className="brand-date"/);
});
```

- [ ] **Step 2: Run the focused tests and verify RED**

Run: `node --experimental-strip-types --test tests/current-date.test.mjs tests/mobile-contract.test.mjs`

Expected: FAIL because `app/components/current-date.ts` and the brand date markup do not exist.

- [ ] **Step 3: Implement the formatter**

Create `app/components/current-date.ts`:

```ts
const currentDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function formatCurrentDate(date: Date): string {
  return currentDateFormatter.format(date);
}
```

- [ ] **Step 4: Render the post-hydration date in the desktop brand**

Update `app/components/app-shell.tsx` to import `useEffect` and `formatCurrentDate`, initialize `currentDate` to an empty string, and set it after mount:

```tsx
const [currentDate, setCurrentDate] = useState("");

useEffect(() => {
  setCurrentDate(formatCurrentDate(new Date()));
}, []);
```

Replace the desktop brand text span with:

```tsx
<span className="brand-copy">
  <span>Project Harbor</span>
  {currentDate ? <span className="brand-date">{currentDate}</span> : null}
</span>
```

- [ ] **Step 5: Add the two-line brand styles**

Add after `.brand` in `app/globals.css`:

```css
.brand-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 3px;
}

.brand-date {
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 500;
  line-height: 1.2;
}
```

- [ ] **Step 6: Run focused and full verification**

Run: `node --experimental-strip-types --test tests/current-date.test.mjs tests/mobile-contract.test.mjs`

Expected: all focused tests PASS with 0 failures.

Run: `npm test && npm run lint`

Expected: production build, all repository tests, and lint PASS with 0 failures.

- [ ] **Step 7: Verify the live preview**

Reload `http://localhost:5174/` at desktop width and confirm the current long-form date appears beneath `Project Harbor` without shifting or clipping the Navigation section.
