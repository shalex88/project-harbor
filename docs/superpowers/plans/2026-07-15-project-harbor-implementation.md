# Project Harbor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and publish the approved Project Harbor team project-management site with desktop/mobile parity, platform sign-in, D1 persistence, R2 files, task/event/timeline dashboards, and cost/payment tracking.

**Architecture:** A server-rendered Vinext shell resolves platform identity and loads an authorized workspace snapshot. Focused domain modules own validation, authorization, D1 queries, monetary aggregation, timeline projection, and R2 access; protected route handlers expose mutations and file operations to a responsive client application. D1 stores relational records and file metadata, while R2 stores item attachments and payment receipts.

**Tech Stack:** Vinext/Next App Router, React 19, TypeScript 5.9, Tailwind CSS 4 plus component CSS, Cloudflare D1, Cloudflare R2, Drizzle schema/migrations, Node test runner.

## Global Constraints

- Task statuses are exactly `todo`, `in_progress`, and `done`.
- Tasks have no priority and no assignees.
- Events are non-actionable, use a required date, and have no task workflow fields.
- Projects use one ISO 4217 currency; cross-project totals are grouped by currency.
- Estimated cost is optional; actual spend is the sum of positive payment entries.
- All desktop workflows must be available at a 390 px mobile width.
- Authorization is enforced server-side for every read, write, upload, and download.
- Use the Deep-Current palette and interaction tokens from the approved specification.
- Preserve the existing Vinext starter, `sites()` Vite plugin, and artifact validation scripts.

---

## File Map

- `db/schema.ts` — Drizzle table and index declarations.
- `db/index.ts` — typed D1 and raw binding access.
- `drizzle/*.sql` — generated D1 migration.
- `lib/domain.ts` — shared types, validation, money, date, and timeline functions.
- `lib/auth.ts` — platform identity plus development-preview identity.
- `lib/repository.ts` — schema initialization for preview, authorization, snapshot queries, and mutations.
- `lib/storage.ts` — protected R2 object operations and safe download response construction.
- `app/api/workspace/route.ts` — snapshot and JSON mutation endpoint.
- `app/api/files/route.ts` — multipart attachment/receipt upload and protected file operations.
- `app/components/harbor-app.tsx` — client state, navigation, modals, drawers, and mutation orchestration.
- `app/components/app-shell.tsx` — desktop sidebar, tablet drawer, mobile top/bottom navigation.
- `app/components/dashboards.tsx` — Overview, Tasks, Events, Timeline, and Spending views.
- `app/components/project-workspace.tsx` — project, membership, collection, and item workflows.
- `app/components/item-sheet.tsx` — task/event editor, files, payments, and receipts.
- `app/components/ui.tsx` — reusable modal, sheet, form, filters, metric, toast, and empty-state primitives.
- `app/page.tsx` — optional-auth landing or authenticated application entry.
- `app/layout.tsx` — product metadata and fonts.
- `app/globals.css` — responsive Deep-Current visual system.
- `tests/domain.test.mjs` — pure domain red/green tests.
- `tests/rendered-html.test.mjs` — production-render contract and sign-in landing.
- `tests/mobile-contract.test.mjs` — source-level functional-parity contract for mobile navigation and controls.

---

### Task 1: Domain contracts and storage schema

**Files:**
- Create: `lib/domain.ts`
- Create: `tests/domain.test.mjs`
- Modify: `db/schema.ts`
- Modify: `db/index.ts`
- Modify: `.openai/hosting.json`
- Create: `drizzle/<generated>.sql`

**Interfaces:**
- Produces: `TaskStatus`, `WorkItem`, `WorkspaceSnapshot`, `Mutation`, `parseMoneyToMinor`, `formatMoney`, `projectTimeline`, `summarizeSpending`, and Drizzle table exports.

- [ ] **Step 1: Write failing domain tests**

```js
test("task status accepts only todo, in_progress, and done", () => {
  assert.equal(validateTaskStatus("in_progress"), "in_progress");
  assert.throws(() => validateTaskStatus("review"), /invalid task status/);
});

test("actual spend and variance derive from payments", () => {
  assert.deepEqual(summarizeItemMoney(10_000, [{ amountMinor: 4_000 }, { amountMinor: 7_500 }]), {
    estimatedMinor: 10_000,
    actualMinor: 11_500,
    varianceMinor: 1_500,
  });
});

test("timeline excludes undated tasks and includes dated events", () => {
  const items = [
    { id: "task-1", type: "task", dueDate: null, occurrenceDate: null },
    { id: "task-2", type: "task", dueDate: "2026-07-18", occurrenceDate: null },
    { id: "event-1", type: "event", dueDate: null, occurrenceDate: "2026-07-17" },
  ];
  assert.deepEqual(projectTimeline(items).map((entry) => entry.id), ["event-1", "task-2"]);
});
```

- [ ] **Step 2: Run red tests**

Run: `node --experimental-strip-types --test tests/domain.test.mjs`

Expected: FAIL because `lib/domain.ts` does not exist.

- [ ] **Step 3: Implement the domain contracts**

```ts
export type TaskStatus = "todo" | "in_progress" | "done";
export type ItemType = "task" | "event";

export class DomainError extends Error {}

export function validateTaskStatus(value: unknown): TaskStatus {
  if (value === "todo" || value === "in_progress" || value === "done") return value;
  throw new DomainError("invalid task status");
}

export function summarizeItemMoney(
  estimatedMinor: number | null,
  payments: Array<{ amountMinor: number }>,
) {
  const actualMinor = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return {
    estimatedMinor,
    actualMinor,
    varianceMinor: estimatedMinor === null ? null : actualMinor - estimatedMinor,
  };
}
```

Define exact project, member, invitation, collection, task/event, file, payment, aggregate, timeline, and mutation union types used by all later tasks. Validation rejects blank names/titles, invalid ISO dates, non-positive payments, cross-type task/event fields, and unsupported currency codes.

- [ ] **Step 4: Define D1 schema and bindings**

Declare `users`, `projects`, `projectMembers`, `projectInvitations`, `collections`, `workItems`, `fileObjects`, `itemFiles`, `payments`, and `paymentReceipts` with the constraints and indexes from specification revision 4. Set `.openai/hosting.json` to:

```json
{
  "d1": "DB",
  "project_id": "appgprj_6a574dedf0108191988d768839471114",
  "r2": "BUCKET"
}
```

Run: `npm run db:generate`

Expected: one new migration containing all ten tables and supporting indexes.

- [ ] **Step 5: Run green tests and inspect migration**

Run: `node --experimental-strip-types --test tests/domain.test.mjs && sed -n '1,260p' drizzle/*.sql`

Expected: domain tests PASS; SQL contains no task-priority or task-assignee columns/tables.

- [ ] **Step 6: Commit**

```bash
git add lib/domain.ts tests/domain.test.mjs db/schema.ts db/index.ts .openai/hosting.json drizzle
git commit -m "feat: define Project Harbor domain and storage schema"
```

---

### Task 2: Identity, authorization, repository, and preview seed

**Files:**
- Create: `lib/auth.ts`
- Create: `lib/repository.ts`
- Create: `tests/authorization.test.mjs`

**Interfaces:**
- Consumes: domain types and D1 tables from Task 1.
- Produces: `getAppUser()`, `requireAppUser()`, `loadWorkspaceSnapshot(user)`, `applyWorkspaceMutation(user, mutation)`, `requireProjectAccess(userId, projectId)`, `requireProjectOwner(userId, projectId)`, and pure `canManagePayment(actor, payment)`.

- [ ] **Step 1: Write failing authorization tests**

```js
test("members cannot edit another member's payment", () => {
  assert.equal(canManagePayment({ role: "member", userId: "u1" }, { createdBy: "u2" }), false);
});

test("owners can manage every project payment", () => {
  assert.equal(canManagePayment({ role: "owner", userId: "owner" }, { createdBy: "u2" }), true);
});
```

- [ ] **Step 2: Run red tests**

Run: `node --experimental-strip-types --test tests/authorization.test.mjs`

Expected: FAIL because authorization helpers do not exist.

- [ ] **Step 3: Implement identity and authorization**

`getAppUser()` wraps `getChatGPTUser()`. In `development` only, missing headers resolve to `{ email: "alex@harbor.local", displayName: "Alex Smith" }` so agent preview can exercise the app. Production never receives this fallback. Page flows use optional identity; mutations require identity.

Authorization queries join membership and project ownership server-side. Resource lookups always derive `project_id` from the resource instead of trusting a client-supplied project ID.

- [ ] **Step 4: Implement repository snapshot and mutations**

`loadWorkspaceSnapshot` upserts the verified local user, accepts matching pending invitations, and returns only accessible projects and related records. `applyWorkspaceMutation` exhaustively handles the domain union for projects, invitations, members, collections, items, and payments. It validates input before executing prepared statements and enforces payment authorship.

Add development-only schema initialization using one prepared `CREATE TABLE/INDEX IF NOT EXISTS` statement per call and seed the three reference projects only when the development user's workspace is empty. Production relies on migrations and never seeds sample records.

- [ ] **Step 5: Run green tests**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/authorization.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/auth.ts lib/repository.ts tests/authorization.test.mjs
git commit -m "feat: add identity authorization and workspace repository"
```

---

### Task 3: Protected workspace and file APIs

**Files:**
- Create: `app/api/workspace/route.ts`
- Create: `app/api/files/route.ts`
- Create: `lib/storage.ts`
- Create: `tests/api-contract.test.mjs`

**Interfaces:**
- Consumes: `requireAppUser`, repository functions, `env.BUCKET`, and domain mutations.
- Produces: `GET /api/workspace`, `POST /api/workspace`, `GET|POST|PATCH|DELETE /api/files`, exported `parseMutation(value)`, and exported `validateUpload(file, kind)`.

- [ ] **Step 1: Write failing route-contract tests**

```js
test("workspace POST rejects an unknown mutation", async () => {
  assert.throws(() => parseMutation({ action: "set_priority" }), /unknown action/);
});

test("file validation rejects executables and oversized item files", () => {
  assert.throws(() => validateUpload({ name: "run.exe", type: "application/x-msdownload", size: 12 }), /unsupported/);
  assert.throws(() => validateUpload({ name: "large.pdf", type: "application/pdf", size: 25 * 1024 * 1024 + 1 }), /25 MB/);
});
```

- [ ] **Step 2: Run red tests**

Run: `node --experimental-strip-types --test tests/api-contract.test.mjs`

Expected: FAIL because parsers and upload validation do not exist.

- [ ] **Step 3: Implement JSON workspace endpoint**

`GET` returns an authorized snapshot. `POST` parses the mutation union, applies it, and returns a fresh snapshot with status `201` for creates and `200` otherwise. Map domain errors to `400`, missing resources to non-revealing `404`, permission failures to `403`, and duplicates to `409`.

- [ ] **Step 4: Implement file and receipt endpoint**

Multipart `POST` accepts exactly one file and either `itemId` or `paymentId`. Item attachments allow up to 25 MB and block executables; receipt uploads allow image/PDF up to 10 MB. R2 keys use `projects/{projectId}/{crypto.randomUUID()}`. Metadata is inserted only after `BUCKET.put` succeeds, and failed metadata writes delete the new object.

`GET?id=` verifies access and streams the object with `Content-Disposition: attachment`. `PATCH` changes pinned state for item files. `DELETE` verifies permissions, removes relationships, and deletes unreferenced objects.

- [ ] **Step 5: Run green tests**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/authorization.test.mjs tests/api-contract.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/api lib/storage.ts tests/api-contract.test.mjs
git commit -m "feat: expose protected workspace and file APIs"
```

---

### Task 4: Deep-Current shell and reusable responsive UI

**Files:**
- Create: `app/components/ui.tsx`
- Create: `app/components/app-shell.tsx`
- Modify: `app/layout.tsx`
- Modify: `app/globals.css`
- Modify: `public/favicon.svg`
- Create: `tests/mobile-contract.test.mjs`

**Interfaces:**
- Produces: `AppShell`, `Modal`, `Sheet`, `Field`, `FilterBar`, `MetricCard`, `ToastRegion`, `EmptyState`, and responsive navigation callbacks.

- [ ] **Step 1: Write failing mobile contract**

```js
test("mobile navigation exposes every dashboard", () => {
  for (const label of ["Overview", "Tasks", "Events", "Timeline", "More"]) {
    assert.match(shellSource, new RegExp(`>${label}<`));
  }
});

test("mobile CSS provides bottom navigation and full-screen sheets", () => {
  assert.match(css, /\.mobile-nav/);
  assert.match(css, /@media \(max-width: 640px\)/);
  assert.match(css, /\.sheet-panel[\s\S]*width:\s*100%/);
});
```

- [ ] **Step 2: Run red test**

Run: `node --test tests/mobile-contract.test.mjs`

Expected: FAIL because the components and responsive rules do not exist.

- [ ] **Step 3: Implement UI primitives and shell**

Use semantic buttons and text labels, 44 px mobile targets, focus trapping/restoration for modal/sheet, Escape dismissal, backdrop dismissal only when safe, and `aria-live` toasts. Desktop uses the 260 px sidebar; tablet uses a drawer; mobile uses the compact header and persistent bottom navigation. `More` exposes projects, Spending, Settings, and account controls.

- [ ] **Step 4: Implement global visual system**

Define the approved palette as CSS custom properties, solid fills, one-pixel borders, tabular numerals, 8 px grid, 140–180 ms transitions, visible seafoam focus, desktop/tablet/mobile breakpoints, and reduced-motion overrides. Avoid gradients and ambient animation.

- [ ] **Step 5: Run green test and lint**

Run: `node --test tests/mobile-contract.test.mjs && npm run lint`

Expected: contract PASS and lint exits 0.

- [ ] **Step 6: Commit**

```bash
git add app/components/ui.tsx app/components/app-shell.tsx app/layout.tsx app/globals.css public/favicon.svg tests/mobile-contract.test.mjs
git commit -m "feat: build responsive Deep-Current application shell"
```

---

### Task 5: Dashboards and timeline

**Files:**
- Create: `app/components/dashboards.tsx`
- Create: `tests/dashboard-contract.test.mjs`

**Interfaces:**
- Consumes: `WorkspaceSnapshot`, shell/UI primitives, `projectTimeline`, and `summarizeSpending`.
- Produces: `OverviewDashboard`, `TasksDashboard`, `EventsDashboard`, `TimelineDashboard`, and `SpendingDashboard`.

- [ ] **Step 1: Write failing dashboard contract tests**

```js
test("dashboard source has no task priority or assignee concepts", () => {
  assert.doesNotMatch(source, /priority|assignee/i);
});

test("timeline offers month week and agenda modes", () => {
  for (const mode of ["Month", "Week", "Agenda"]) assert.match(source, new RegExp(`>${mode}<`));
});

test("spending labels estimates actuals and variance", () => {
  for (const label of ["Estimated", "Actual spend", "Variance"]) assert.match(source, new RegExp(label));
});
```

- [ ] **Step 2: Run red tests**

Run: `node --test tests/dashboard-contract.test.mjs`

Expected: FAIL because dashboard source does not exist.

- [ ] **Step 3: Implement dashboard views**

Overview shows open tasks, tasks due this week, upcoming events, focused tasks, and events. Tasks filters project, collection, status, and due range. Events separates upcoming/past and filters project, collection, and date. Timeline combines dated tasks/events and supports month/week/agenda with agenda as the mobile default. Spending groups cross-project cards by currency and provides estimates, actuals, variance, over-estimate items, collection breakdown, recent payments, and accessible data tables.

- [ ] **Step 4: Run green tests**

Run: `node --test tests/dashboard-contract.test.mjs tests/mobile-contract.test.mjs`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add app/components/dashboards.tsx tests/dashboard-contract.test.mjs
git commit -m "feat: add task event timeline and spending dashboards"
```

---

### Task 6: Project, collection, and item workflows

**Files:**
- Create: `app/components/project-workspace.tsx`
- Create: `app/components/item-sheet.tsx`
- Create: `tests/workflow-contract.test.mjs`

**Interfaces:**
- Consumes: workspace mutation callback, UI primitives, domain records.
- Produces: project/member/collection controls plus task/event detail workflows.

- [ ] **Step 1: Write failing workflow contracts**

```js
test("task form exposes only the approved workflow fields", () => {
  for (const field of ["Title", "Description", "Status", "Due date", "Estimated cost"]) assert.match(source, new RegExp(field));
  assert.doesNotMatch(source, /priority|assignee/i);
});

test("event form has occurrence date and no task status", () => {
  assert.match(source, /Occurrence date/);
  assert.match(source, /item\.type === "task"/);
});
```

- [ ] **Step 2: Run red tests**

Run: `node --test tests/workflow-contract.test.mjs`

Expected: FAIL because workflow components do not exist.

- [ ] **Step 3: Implement project and collection workspace**

Add project create/settings with ISO currency selection, owner member/invitation controls, collection create/edit/reorder/delete, collection tabs, filters, and item create actions. Mobile exposes the same actions in sheets and overflow menus.

- [ ] **Step 4: Implement item sheet**

Task fields are title, description, `todo|in_progress|done`, optional due date, and optional estimated cost. Event fields are title, description, required occurrence date, and optional estimated cost. Both share files and payments panels; no task assignment or priority UI exists.

- [ ] **Step 5: Run green tests**

Run: `node --test tests/workflow-contract.test.mjs tests/dashboard-contract.test.mjs`

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add app/components/project-workspace.tsx app/components/item-sheet.tsx tests/workflow-contract.test.mjs
git commit -m "feat: add project collection task and event workflows"
```

---

### Task 7: Application orchestration, files, payments, and sign-in entry

**Files:**
- Create: `app/components/harbor-app.tsx`
- Modify: `app/page.tsx`
- Modify: `tests/rendered-html.test.mjs`

**Interfaces:**
- Consumes: all views, workspace snapshot, mutation API, and file API.
- Produces: complete authenticated application and anonymous sign-in landing.

- [ ] **Step 1: Extend rendered HTML test first**

```js
test("anonymous production render offers ChatGPT sign-in", async () => {
  const response = await renderHomeWithoutAuth();
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Sign in with ChatGPT/);
});
```

- [ ] **Step 2: Run red test**

Run: `npm test`

Expected: FAIL because the starter page does not contain the sign-in action.

- [ ] **Step 3: Implement application orchestration**

`HarborApp` holds route, filters, selected project/collection/item, modal state, mobile navigation, pending mutation state, and toasts. JSON mutations replace the current snapshot from the server response. Uploads show progress state, refresh snapshot after success, and retain retry details on failure.

Item files support native picker, desktop drag/drop, protected download, pin/unpin, and removal. Payments support create/edit/delete by permission, optional receipt upload/capture, actual/variance recalculation, and mobile full-screen history.

- [ ] **Step 4: Implement page entry**

Production anonymous users receive a polished sign-in landing with `/signin-with-chatgpt?return_to=%2F`. Authenticated users load their authorized snapshot and render `HarborApp`. Development preview uses the isolated demo identity and seed from Task 2.

- [ ] **Step 5: Run green tests and lint**

Run: `npm test && npm run lint`

Expected: production build, rendered HTML tests, and lint all exit 0.

- [ ] **Step 6: Commit**

```bash
git add app/components/harbor-app.tsx app/page.tsx tests/rendered-html.test.mjs
git commit -m "feat: integrate Project Harbor application workflows"
```

---

### Task 8: Migration, full verification, preview QA, and hosted checkpoint

**Files:**
- Modify only files required by failures found during verification.

**Interfaces:**
- Produces: verified build artifact and deployed Sites checkpoint.

- [ ] **Step 1: Run complete automated verification**

Run: `node --experimental-strip-types --test tests/domain.test.mjs tests/authorization.test.mjs tests/api-contract.test.mjs && node --test tests/mobile-contract.test.mjs tests/dashboard-contract.test.mjs tests/workflow-contract.test.mjs && npm run lint && npm test && npm run validate:artifact`

Expected: all tests PASS; lint, build, and artifact validation exit 0.

- [ ] **Step 2: Inspect migration and built bindings**

Run: `rg -n 'priority|assignee' db drizzle app lib .openai/hosting.json || true`

Expected: no task-priority or task-assignee product concepts. Confirm `dist/.openai/hosting.json` declares `DB` and `BUCKET` and generated migration SQL is present.

- [ ] **Step 3: Run agent preview QA**

Start `sites-preview`, inspect 1440×900 desktop and 390 px mobile layouts, and exercise Overview, Tasks, Events, all Timeline modes, Spending, project/member controls, collections, task/event forms, file actions, payments, and receipts. Fix any source problem revealed and repeat the relevant automated command plus preview check.

- [ ] **Step 4: Request code review**

Provide the reviewer with specification revision 4, this implementation plan, the base commit, and the implementation head. Fix every Critical and Important finding and rerun the affected verification commands.

- [ ] **Step 5: Create and verify checkpoint deployment**

Run the Sites checkpoint command with a concise summary, then use the mandatory deployment-status verification call until the immutable deployment is confirmed ready. Share the verified URL.

- [ ] **Step 6: Final requirements audit**

Compare every acceptance criterion in specification revision 4 against the implementation and verification evidence. Report any remaining gap instead of claiming completion.
