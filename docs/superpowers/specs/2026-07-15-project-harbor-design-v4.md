# Project Harbor Design Specification — Revision 4

Date: 2026-07-15

## 1. Product Summary

Project Harbor is a sign-in-gated project-management site for small teams. A project owner creates a project, invites members by email, and organizes work into multiple collections. Collections contain two independent item types:

- Tasks are actionable work with workflow state and an optional due date.
- Events are non-actionable occurrences with a date, description, and files. Events do not have workflow status.

Tasks and events can store file attachments, and attachments can be pinned within their item. Both item types can carry an optional estimated cost. Actual spend is derived from one or more payment entries rather than from an editable total.

The product starts on a cross-project work hub and provides dedicated Tasks, Events, Timeline, and Spending dashboards. All durable product data uses platform-backed storage.

## 2. Goals

The first release must let a signed-in user:

1. Create and manage projects.
2. Invite a small team to a project and enforce project membership on every read and write.
3. Create multiple ordered collections within a project.
4. Create, edit, filter, complete, and delete tasks within collections.
5. Create, edit, filter, and delete dated events within collections.
6. Upload, download, pin, unpin, and remove files attached to tasks and events.
7. Set an optional estimated cost on a task or event.
8. Record multiple dated payments, with notes and optional receipts, against a task or event.
9. See cross-project dashboards for tasks, events, a combined timeline, and spending.
10. Use every desktop capability on mobile, with presentation adapted for touch and narrow screens but no reduced product functionality.

## 3. Non-Goals

The first release does not include recurring events, event times or time zones, external calendar synchronization, task dependencies, comments, notifications, custom roles, public sharing, currency conversion, project budgets, accounting exports, approval workflows, or payment-provider integrations.

## 4. Product Model

### 4.1 Users and identity

The site uses dispatch-owned Sign in with ChatGPT. The application reads the verified identity supplied by the hosting platform and never accepts user identity from client-submitted fields. Protected pages redirect anonymous viewers through the platform-owned sign-in flow. Protected endpoints return an authentication error when identity is absent.

The application stores a local user record keyed by verified email, with the optional platform display name used only for presentation.

### 4.2 Projects and membership

A project has one owner, a name, optional description, one ISO 4217 currency code, and timestamps. Currency is selected at project creation and applies to all monetary values in that project.

Project access is explicit:

- The owner can manage project settings, invitations, membership, collections, all work items, all attachments, and every payment entry.
- Members can view all project content; create and edit collections, tasks, events, and attachments; add payments; and edit or delete only payments they created.
- Removing a member revokes future access but does not delete their historical authorship or payment records.

Owners invite members by email. An invitation remains pending until the same verified email signs in. At that point the invitation is accepted and a membership is created automatically. Duplicate active memberships and duplicate pending invitations are rejected.

### 4.3 Collections

A project contains one or more named collections. A collection has a project-local display order and an optional color token used for recognition in filters and lists. Deleting a non-empty collection requires an explicit confirmation and deletes its contained items, attachments, payments, and receipts.

### 4.4 Tasks

A task belongs to exactly one collection and therefore one project. It contains:

- Title and optional description
- Status: `todo`, `in_progress`, or `done`
- Optional due date
- Optional estimated cost in project-currency minor units
- Creator and created/updated timestamps

Completing a task sets its status to `done`; reopening it returns the task to `todo`. Tasks do not depend on events.

### 4.5 Events

An event belongs to exactly one collection and therefore one project. It contains:

- Title and optional description
- Required occurrence date
- Optional estimated cost in project-currency minor units
- Creator and created/updated timestamps

Events are non-actionable records. They have no completion state, workflow status, or due date. The interface classifies an event as upcoming or past by comparing its occurrence date with the current date. Events and tasks are independent siblings; neither contains, blocks, or controls the other.

### 4.6 Files

Files may be attached to either a task or an event. Blob bytes are stored in R2. D1 stores the file's project, opaque object key, original filename, content type, byte size, uploader, and timestamps. The item-file relationship stores the pinned state and attachment order.

Pinned files appear before unpinned files inside an item. Downloads always pass through a protected server endpoint that rechecks project membership and returns a safe attachment disposition. Object keys use generated identifiers rather than user filenames. The initial per-file limit is 25 MB; executable file types are rejected.

Removing an item attachment deletes the relationship and deletes the underlying object when it has no remaining reference. Deleting an item cascades through attachment relationships, payments, and receipts, then removes their unreferenced objects.

### 4.7 Costs and payments

Tasks and events have an optional `estimated_cost_minor` integer. A null value means no estimate exists; zero is a valid explicit estimate.

Each task or event can have many payment entries. A payment contains a positive amount in project-currency minor units, payment date, optional note, creator, timestamps, and at most one optional receipt file. Receipt files use the same protected object-storage mechanism as item attachments, with a 10 MB limit and image/PDF content types.

Actual spend is calculated as the sum of payment amounts for the item. It is never directly editable. Variance is calculated only when an estimate exists:

`variance = actual spend - estimated cost`

A positive variance is over estimate, a negative variance is under estimate, and zero is on estimate. Deleting or editing a payment immediately changes actual spend and variance.

All project members may view and add payments. A member may edit or delete only a payment they created. The project owner may edit or delete any project payment.

## 5. Information Architecture

### 5.1 Global routes

- `/` — cross-project Overview dashboard
- `/tasks` — cross-project task dashboard
- `/events` — cross-project event dashboard
- `/timeline` — combined chronological view of task due dates and event occurrence dates
- `/spending` — cross-project spending dashboard
- `/projects/[projectId]` — project overview, collections, members, and project-level totals
- `/projects/[projectId]/collections/[collectionId]` — collection task/event workspace

Creation forms and item details use accessible modal and drawer overlays so users keep their current dashboard or collection context.

### 5.2 Global navigation

The fixed desktop sidebar contains Overview, Tasks, Events, Timeline, Spending, accessible projects, Settings, and the signed-in user control. On tablet it becomes a drawer. Mobile uses a compact top bar plus persistent bottom navigation for Overview, Tasks, Events, Timeline, and More; More opens projects, Spending, Settings, and the account control. The top bar contains page context and the primary context-sensitive creation action.

### 5.3 Overview dashboard

The Overview is personal and cross-project. Its first viewport contains:

- Open tasks across the user's accessible projects
- Tasks due this week
- Upcoming events
- Filter controls for project, collection, and status where relevant
- A focused task table
- An upcoming-events panel

Filters are encoded in URL search parameters so filtered views survive refresh and can be shared with another authorized member.

### 5.4 Task dashboard

The task dashboard lists all tasks across the user's accessible projects. Users can filter by project, collection, status, and due-date range. Desktop uses a semantic table; narrow screens use stacked task cards with equivalent information and controls.

### 5.5 Event dashboard

The event dashboard separates Upcoming and Past sections and sorts each by occurrence date. Users can filter by project, collection, and date range. Events use date-only presentation and never show completion controls.

### 5.6 Timeline dashboard

The timeline dashboard combines dated tasks and events across accessible projects into one chronological stream. Task entries use their optional due date; undated tasks do not appear. Event entries use their required occurrence date. Entries are grouped by day and visually distinguish actionable tasks from non-actionable events without implying a relationship between them. Users can move between month, week, and agenda views and filter by item type, project, collection, task status, and date range. Selecting an entry opens the same item detail drawer or mobile sheet used elsewhere.

### 5.7 Spending dashboard

The spending dashboard provides:

- Estimated cost, actual spend, and variance totals
- Estimated-versus-actual comparisons
- Spending grouped by project and collection
- Items exceeding their estimate
- Recent payment activity with receipt access
- Project, collection, and payment-date filters

Project-level views display a single currency. Cross-project totals are grouped by currency code and never add different currencies together. Items without an estimate contribute to actual-spend totals but do not contribute to estimated totals or variance calculations.

## 6. Visual Design

The selected direction is **Deep-Current Control Room**.

### 6.1 Tokens

- Shell: `#07111F`
- Sidebar: `#081827`
- Workspace: `#0B1726`
- Cards: `#122235`
- Selected/elevated surfaces: `#162A40`
- Borders: `#263D55`
- Primary cyan: `#22D3EE`
- Secondary seafoam: `#5EEAD4`
- Primary text: `#F2F7FA`
- Secondary text: `#9CB2C6`
- Muted text: `#668198`
- Warning: `#FBBF24`

Use solid fills, crisp one-pixel borders, restrained menu/modal shadows, 8–12 px radii, and no gradients. Typography uses Inter or Geist with tabular numerals for financial values, counts, and dates.

### 6.2 Desktop composition

The 1440×900 reference layout uses a 260 px fixed sidebar and 40 px workspace gutters. A three-card summary row sits above a filter bar. The main content uses an approximately 2:1 task-to-event split. The Timeline route uses the same shell with a wide date grid or agenda surface. The Spending route reuses the dashboard density with summary metrics above grouped comparisons and recent payments.

Mobile is a first-class design target at a 390 px reference width. Content uses 16 px page gutters, a compact top bar, persistent bottom navigation, single-column metric cards, touch-friendly filter sheets, and full-screen item details.

### 6.3 Mobile functional parity

Mobile provides the same data, authorization, and read/write capabilities as desktop. Responsive design may replace tables with cards, side drawers with full-screen sheets, hover menus with touch menus, and side-by-side panels with sequential screens, but it must not remove or disable functionality.

The complete mobile feature set includes:

- Project creation and settings, member invitations, member removal, and pending-invitation visibility
- Collection creation, reordering, editing, navigation, and confirmed deletion
- Task and event creation, editing, filtering, date handling, cost estimation, and deletion
- All Timeline modes—month, week, and agenda—with agenda as the mobile default
- Item file selection through the native picker, upload progress, download, pinning, unpinning, and removal
- Payment creation, editing, deletion, receipt capture or selection, and payment-history access
- Overview, Tasks, Events, Timeline, and Spending dashboards with the same filters, totals, drill-downs, and underlying records as desktop
- Accessible alternatives for visual spending comparisons and any dense timeline or table presentation

Desktop drag-and-drop upload is supplemented by the native mobile file and camera picker. Actions hidden behind a mobile overflow menu remain labeled, keyboard accessible where a keyboard is present, and reachable without precision gestures.

### 6.4 Interaction and motion

Rows and cards use a one-pixel hover lift and a brighter border. Selected navigation and primary actions use solid cyan with dark text. Keyboard focus uses a two-pixel seafoam ring with shell offset. Transitions last 140–180 ms and affect only color, border, opacity, or one-pixel transforms. Reduced-motion preferences remove non-essential movement.

## 7. Component Boundaries

The interface is organized into focused units:

- `AppShell` owns global navigation and responsive sidebar behavior.
- Dashboard route components load authorized, filtered summaries.
- `MetricCard`, `FilterBar`, `TaskTable`, `EventList`, `TimelineView`, and spending panels render reusable dashboard sections.
- `ProjectWorkspace` and `CollectionWorkspace` coordinate project-local navigation.
- `ItemDrawer` composes task- or event-specific detail fields with shared files and payments panels.
- `FilePanel` handles selection, progress, pinning, downloading, and removal.
- `PaymentPanel` displays computed totals and payment history and opens the payment form.
- Modal form components own field validation and accessible focus behavior.

Server-side domain modules isolate authentication, authorization, D1 queries, R2 operations, dashboard aggregation, and monetary calculations from route handlers and UI components.

## 8. Persistence Design

The D1 schema contains the following logical tables:

- `users`
- `projects`
- `project_members`
- `project_invitations`
- `collections`
- `work_items` with a constrained `type` of `task` or `event`
- `file_objects`
- `item_files`
- `payments`
- `payment_receipts`

Foreign keys and project IDs prevent cross-project relationships. Unique constraints protect active membership, pending invitations, and a single receipt per payment. Indexes support membership lookup, project/collection listing, task status/due-date filters, event occurrence-date filters, payment-date filters, and item-level aggregation.

All money values use integer minor units. Dates use ISO `YYYY-MM-DD` strings because the first release is date-only. Timestamps use UTC ISO strings for audit fields.

## 9. Request and Data Flow

1. A protected server-rendered route resolves the verified user.
2. The authorization module resolves accessible projects or verifies the requested project membership.
3. The query module loads summary and list data using URL filters.
4. Client interactions submit to protected server endpoints.
5. The endpoint validates input, repeats authorization, performs D1/R2 changes, and returns a typed result.
6. The client refreshes only affected summaries and lists while preserving URL filters and drawer state where possible.

Uploads request item authorization before reading payload bytes. Metadata is inserted only after the object write succeeds. If metadata insertion fails, the newly written object is removed. Deletes remove database relationships first and then best-effort cleanup unreferenced objects, with idempotent retry support.

## 10. Validation, Errors, and Security

- Anonymous page visits enter the platform sign-in flow; anonymous API calls return `401`.
- Requests outside a user's project membership return a non-revealing `404` where existence is sensitive.
- Unauthorized role actions return `403`.
- Duplicate memberships or invitations return a clear `409` conflict.
- Forms validate required fields, project-local references, currency minor units, positive payment amounts, and date formats on both client and server.
- Uploads validate size and type before storage where possible and return actionable retry states.
- UI mutations expose pending, success, and error feedback without discarding user input.
- Destructive actions require explicit confirmation.
- Filenames are presentation metadata only; generated object keys prevent path injection.
- Authorization is enforced server-side for every read, mutation, upload, download, and receipt request.

Concurrent edits use last-write-wins in the first release, with `updated_at` retained for later optimistic concurrency control.

## 11. Accessibility and Responsive Behavior

All controls are keyboard reachable, icon-only controls have accessible names, dialogs trap and restore focus, tables use semantic headers, validation errors are associated with fields, and status information is not conveyed by color alone. Color contrast targets WCAG AA. The site supports reduced motion.

At tablet widths, the sidebar becomes a drawer and dashboard grids reduce their column count. At mobile widths, global navigation moves to the persistent bottom bar, dashboard grids stack, tables become cards, item drawers become full-screen sheets, and the timeline defaults to agenda view. Every desktop action remains reachable, and touch targets remain at least 44 px.

## 12. Verification Strategy

Automated tests cover:

- Sign-in gating and missing identity
- Project owner/member authorization boundaries
- Invitation acceptance and duplicate handling
- Collection ordering and deletion behavior
- Task and event validation and CRUD
- Event date classification without task-style state
- Timeline grouping, filters, undated-task exclusion, and mobile agenda behavior
- File upload metadata, membership-protected download, pinning, and cleanup
- Payment creation, authorship permissions, receipt handling, actual-spend sums, and variance calculations
- Cross-project currency grouping
- Dashboard filters and aggregate totals

End-to-end interaction checks run the same critical workflow matrix at desktop and 390 px mobile widths: sign-in, project creation and settings, invitation and membership management, collection management, task/event CRUD, every timeline mode, file upload/download/pinning, payment and receipt management, spending drill-down, filters, and destructive confirmations. Visual QA checks the selected 1440×900 desktop composition and the complete 390 px mobile experience, plus representative tablet layouts, keyboard focus, touch targets, bottom navigation, full-screen sheets, and reduced motion.

## 13. Acceptance Criteria

The release is complete when two signed-in users can collaborate in an owner-created project; organize work into collections; manage tasks and independent dated events; use every combined-timeline mode; attach and pin files; estimate costs; record auditable payments with receipts; and see correct task, event, timeline, and currency-safe spending dashboards on both desktop and mobile. Every desktop workflow must be completable at a 390 px mobile width without switching to desktop mode. Attempts to access another project without membership must fail server-side, and the production build, automated tests, desktop/mobile visual previews, and hosted checkpoint must pass.
