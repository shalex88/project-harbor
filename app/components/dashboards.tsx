"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  formatMoney,
  projectTimeline,
  summarizeSpending,
  type EventRecord,
  type TaskRecord,
  type WorkItemRecord,
  type WorkspaceSnapshot,
} from "@/lib/domain";
import {
  relationMetadataPhrases,
  workItemMetadata,
} from "@/lib/relation-metadata";
import {
  normalizeAgendaSortOrder,
  sortAgendaEntries,
} from "./agenda-sort";
import { isPastAgendaDate } from "./agenda-date-state";
import { localDateIso } from "./current-date";
import { EmptyState, MetricCard } from "./ui";
import { WorkItemTitle } from "./work-item-title";
import type { AppRoute } from "./app-shell";

type DashboardProps = {
  snapshot: WorkspaceSnapshot;
  onOpenItem: (itemId: string) => void;
  onNavigate?: (route: AppRoute) => void;
};

const TIMELINE_MODES = [
  { id: "month", label: "Month" },
  { id: "week", label: "Week" },
  { id: "agenda", label: "Agenda" },
] as const;

let cachedCurrentDate = "";

const subscribeToCurrentDate = (onStoreChange: () => void) => {
  if (cachedCurrentDate === "") {
    cachedCurrentDate = localDateIso(new Date());
    queueMicrotask(onStoreChange);
  }
  return () => {};
};
const getCurrentDateSnapshot = () => cachedCurrentDate;
const getCurrentDateServerSnapshot = () => "";

function useUrlFilter(
  parameter: string,
  defaultValue: string,
): [string, (value: string) => void] {
  const subscribe = useCallback((notify: () => void) => {
    window.addEventListener("popstate", notify);
    window.addEventListener("harbor:url", notify);
    return () => {
      window.removeEventListener("popstate", notify);
      window.removeEventListener("harbor:url", notify);
    };
  }, []);
  const getSnapshot = useCallback(
    () =>
      new URL(window.location.href).searchParams.get(parameter) ?? defaultValue,
    [defaultValue, parameter],
  );
  const getServerSnapshot = useCallback(() => defaultValue, [defaultValue]);
  const value = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const setValue = useCallback((nextValue: string) => {
    const url = new URL(window.location.href);
    if (nextValue === defaultValue || nextValue === "") {
      url.searchParams.delete(parameter);
    } else {
      url.searchParams.set(parameter, nextValue);
    }
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
    window.dispatchEvent(new Event("harbor:url"));
  }, [defaultValue, parameter]);

  return [value, setValue];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().slice(0, 10);
}

function prettyDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    year: value.slice(0, 4) === todayIso().slice(0, 4) ? undefined : "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function projectName(snapshot: WorkspaceSnapshot, projectId: string): string {
  return snapshot.projects.find((project) => project.id === projectId)?.name ?? "Unknown project";
}

function collectionName(snapshot: WorkspaceSnapshot, collectionId: string): string {
  return snapshot.collections.find((collection) => collection.id === collectionId)?.name ?? "Unknown collection";
}

function projectCurrency(snapshot: WorkspaceSnapshot, projectId: string): string {
  return snapshot.projects.find((project) => project.id === projectId)?.currency ?? "USD";
}

function statusLabel(status: TaskRecord["status"]): string {
  return status === "in_progress" ? "In progress" : status === "done" ? "Done" : "To do";
}

function Panel({
  title,
  count,
  children,
  action,
}: {
  title: string;
  count?: number;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="panel-card">
      <header className="panel-header">
        <div>
          <h2>{title}</h2>
          {count !== undefined ? <span className="count-chip">{count}</span> : null}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="filter-control">
      <span className="sr-only">{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={label}>
        {children}
      </select>
    </label>
  );
}

function FilterDate({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="filter-control filter-date">
      <span>{label}</span>
      <input
        type="date"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-label={label}
      />
    </label>
  );
}

function TaskRow({
  item,
  snapshot,
  onOpen,
}: {
  item: TaskRecord;
  snapshot: WorkspaceSnapshot;
  onOpen: () => void;
}) {
  return (
    <button className="task-row" type="button" onClick={onOpen}>
      <span className={`task-check ${item.status === "done" ? "complete" : ""}`} aria-hidden="true">
        {item.status === "done" ? "✓" : ""}
      </span>
      <span className="row-title">
        <WorkItemTitle item={item} />
        <small>
          {workItemMetadata(
            [
              projectName(snapshot, item.projectId),
              collectionName(snapshot, item.collectionId),
            ],
            item.id,
            snapshot.relations,
            snapshot.items,
          )}
        </small>
      </span>
      <span className="date-chip">{item.dueDate ? prettyDate(item.dueDate) : "No due date"}</span>
      <span className={`status-chip status-${item.status}`}>{statusLabel(item.status)}</span>
      <span className="row-arrow" aria-hidden="true">›</span>
    </button>
  );
}

function EventRow({
  item,
  snapshot,
  onOpen,
}: {
  item: EventRecord;
  snapshot: WorkspaceSnapshot;
  onOpen: () => void;
}) {
  return (
    <button className="event-row" type="button" onClick={onOpen}>
      <span className="event-date" aria-hidden="true">
        <strong>{new Date(`${item.occurrenceDate}T00:00:00Z`).getUTCDate()}</strong>
        <small>{new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(new Date(`${item.occurrenceDate}T00:00:00Z`))}</small>
      </span>
      <span className="row-title">
        <WorkItemTitle item={item} />
        <small>
          {workItemMetadata(
            [
              projectName(snapshot, item.projectId),
              collectionName(snapshot, item.collectionId),
            ],
            item.id,
            snapshot.relations,
            snapshot.items,
          )}
        </small>
      </span>
      <span className="row-arrow" aria-hidden="true">›</span>
    </button>
  );
}

export function OverviewDashboard({ snapshot, onOpenItem, onNavigate }: DashboardProps) {
  const [projectId, setProjectId] = useUrlFilter("project", "all");
  const [collectionId, setCollectionId] = useUrlFilter("collection", "all");
  const [taskStatus, setTaskStatus] = useUrlFilter("status", "open");
  const today = todayIso();
  const weekEnd = addDays(today, 7);
  const visibleCollections = snapshot.collections.filter(
    (collection) => projectId === "all" || collection.projectId === projectId,
  );
  const openTasks = snapshot.items.filter(
    (item): item is TaskRecord =>
      item.type === "task" &&
      item.status !== "done" &&
      (projectId === "all" || item.projectId === projectId) &&
      (collectionId === "all" || item.collectionId === collectionId) &&
      (taskStatus === "open" || item.status === taskStatus),
  );
  const dueThisWeek = openTasks.filter(
    (item) => item.dueDate && item.dueDate >= today && item.dueDate <= weekEnd,
  );
  const upcomingEvents = snapshot.items
    .filter((item): item is EventRecord =>
      item.type === "event" &&
      item.occurrenceDate >= today &&
      (projectId === "all" || item.projectId === projectId) &&
      (collectionId === "all" || item.collectionId === collectionId),
    )
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));

  return (
    <div className="dashboard-stack">
      <div className="filter-bar" aria-label="Overview filters">
        <FilterSelect label="Filter overview by project" value={projectId} onChange={(value) => { setProjectId(value); setCollectionId("all"); }}>
          <option value="all">All projects</option>
          {snapshot.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter overview by collection" value={collectionId} onChange={setCollectionId}>
          <option value="all">All collections</option>
          {visibleCollections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter overview by task status" value={taskStatus} onChange={setTaskStatus}>
          <option value="open">Open tasks</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
        </FilterSelect>
        <button className="button button-secondary filter-clear" type="button" onClick={() => { setProjectId("all"); setCollectionId("all"); setTaskStatus("open"); }}>Clear</button>
      </div>
      <section className="metric-grid" aria-label="Workspace summary">
        <MetricCard label="open tasks" value={openTasks.length} onClick={() => onNavigate?.("tasks")} />
        <MetricCard label="due this week" value={dueThisWeek.length} accent="blue" onClick={() => onNavigate?.("tasks")} />
        <MetricCard label="upcoming events" value={upcomingEvents.length} accent="seafoam" onClick={() => onNavigate?.("events")} />
      </section>
      <div className="dashboard-bento">
        <Panel
          title="Focused tasks"
          count={openTasks.length}
          action={<button className="text-action" type="button" onClick={() => onNavigate?.("tasks")}>View all</button>}
        >
          <div className="row-list">
            {openTasks.slice(0, 6).map((item) => (
              <TaskRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />
            ))}
            {!openTasks.length ? <EmptyState title="No open tasks" description="Create a task inside a collection to start tracking actionable work." /> : null}
          </div>
        </Panel>
        <Panel
          title="Upcoming events"
          count={upcomingEvents.length}
          action={<button className="text-action" type="button" onClick={() => onNavigate?.("events")}>View all</button>}
        >
          <div className="row-list compact-list">
            {upcomingEvents.slice(0, 5).map((item) => (
              <EventRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />
            ))}
            {!upcomingEvents.length ? <EmptyState title="No upcoming events" description="Dated, non-actionable occurrences will appear here." /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

export function TasksDashboard({ snapshot, onOpenItem }: DashboardProps) {
  const [projectId, setProjectId] = useUrlFilter("project", "all");
  const [collectionId, setCollectionId] = useUrlFilter("collection", "all");
  const [status, setStatus] = useUrlFilter("status", "open");
  const [due, setDue] = useUrlFilter("due", "all");
  const [dueFrom, setDueFrom] = useUrlFilter("from", "");
  const [dueTo, setDueTo] = useUrlFilter("to", "");
  const today = todayIso();
  const weekEnd = addDays(today, 7);

  const visibleCollections = snapshot.collections.filter(
    (collection) => projectId === "all" || collection.projectId === projectId,
  );
  const tasks = snapshot.items.filter((item): item is TaskRecord => {
    if (item.type !== "task") return false;
    if (projectId !== "all" && item.projectId !== projectId) return false;
    if (collectionId !== "all" && item.collectionId !== collectionId) return false;
    if (status === "open" && item.status === "done") return false;
    if (status !== "all" && status !== "open" && item.status !== status) return false;
    if (due === "week" && (!item.dueDate || item.dueDate < today || item.dueDate > weekEnd)) return false;
    if (due === "overdue" && (!item.dueDate || item.dueDate >= today || item.status === "done")) return false;
    if (due === "none" && item.dueDate) return false;
    if (dueFrom && (!item.dueDate || item.dueDate < dueFrom)) return false;
    if (dueTo && (!item.dueDate || item.dueDate > dueTo)) return false;
    return true;
  });

  return (
    <div className="dashboard-stack">
      <div className="filter-bar" aria-label="Task filters">
        <FilterSelect label="Filter by project" value={projectId} onChange={(value) => { setProjectId(value); setCollectionId("all"); }}>
          <option value="all">All projects</option>
          {snapshot.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter by collection" value={collectionId} onChange={setCollectionId}>
          <option value="all">All collections</option>
          {visibleCollections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter by status" value={status} onChange={setStatus}>
          <option value="open">Open tasks</option>
          <option value="all">All statuses</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </FilterSelect>
        <FilterSelect label="Filter by due date" value={due} onChange={setDue}>
          <option value="all">Any due date</option>
          <option value="week">Due this week</option>
          <option value="overdue">Overdue</option>
          <option value="none">No due date</option>
        </FilterSelect>
        <FilterDate label="Due date from" value={dueFrom} onChange={setDueFrom} />
        <FilterDate label="Due date to" value={dueTo} onChange={setDueTo} />
        <button className="button button-secondary filter-clear" type="button" onClick={() => { setProjectId("all"); setCollectionId("all"); setStatus("open"); setDue("all"); setDueFrom(""); setDueTo(""); }}>Clear</button>
      </div>
      <Panel title="Tasks" count={tasks.length}>
        <div className="row-list">
          {tasks.map((item) => <TaskRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />)}
          {!tasks.length ? <EmptyState title="No tasks match" description="Change a filter or create a task inside a project collection." /> : null}
        </div>
      </Panel>
    </div>
  );
}

export function EventsDashboard({ snapshot, onOpenItem }: DashboardProps) {
  const [projectId, setProjectId] = useUrlFilter("project", "all");
  const [collectionId, setCollectionId] = useUrlFilter("collection", "all");
  const [dateFrom, setDateFrom] = useUrlFilter("from", "");
  const [dateTo, setDateTo] = useUrlFilter("to", "");
  const today = todayIso();
  const visibleCollections = snapshot.collections.filter(
    (collection) => projectId === "all" || collection.projectId === projectId,
  );
  const filtered = snapshot.items
    .filter(
      (item): item is EventRecord =>
        item.type === "event" &&
        (projectId === "all" || item.projectId === projectId) &&
        (collectionId === "all" || item.collectionId === collectionId) &&
        (!dateFrom || item.occurrenceDate >= dateFrom) &&
        (!dateTo || item.occurrenceDate <= dateTo),
    )
    .sort((a, b) => a.occurrenceDate.localeCompare(b.occurrenceDate));
  const upcoming = filtered.filter((item) => item.occurrenceDate >= today);
  const past = filtered.filter((item) => item.occurrenceDate < today).reverse();

  return (
    <div className="dashboard-stack">
      <div className="filter-bar" aria-label="Event filters">
        <FilterSelect label="Filter by project" value={projectId} onChange={(value) => { setProjectId(value); setCollectionId("all"); }}>
          <option value="all">All projects</option>
          {snapshot.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter by collection" value={collectionId} onChange={setCollectionId}>
          <option value="all">All collections</option>
          {visibleCollections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
        </FilterSelect>
        <FilterDate label="Event date from" value={dateFrom} onChange={setDateFrom} />
        <FilterDate label="Event date to" value={dateTo} onChange={setDateTo} />
        <button className="button button-secondary filter-clear" type="button" onClick={() => { setProjectId("all"); setCollectionId("all"); setDateFrom(""); setDateTo(""); }}>Clear</button>
      </div>
      <div className="two-column-panels">
        <Panel title="Upcoming events" count={upcoming.length}>
          <div className="row-list compact-list">
            {upcoming.map((item) => <EventRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />)}
            {!upcoming.length ? <EmptyState title="No upcoming events" description="Future events will be listed by occurrence date." /> : null}
          </div>
        </Panel>
        <Panel title="Past events" count={past.length}>
          <div className="row-list compact-list">
            {past.map((item) => <EventRow key={item.id} item={item} snapshot={snapshot} onOpen={() => onOpenItem(item.id)} />)}
            {!past.length ? <EmptyState title="No past events" description="Past occurrences remain available for reference." /> : null}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function monthGrid(anchor: string): string[] {
  const date = new Date(`${anchor.slice(0, 7)}-01T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => addDays(date.toISOString().slice(0, 10), index));
}

function weekGrid(anchor: string): string[] {
  const date = new Date(`${anchor}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return Array.from({ length: 7 }, (_, index) => addDays(date.toISOString().slice(0, 10), index));
}

function shiftAnchor(anchor: string, mode: "month" | "week" | "agenda", amount: number): string {
  const date = new Date(`${anchor}T00:00:00Z`);
  if (mode === "month") date.setUTCMonth(date.getUTCMonth() + amount, 1);
  else date.setUTCDate(date.getUTCDate() + amount * 7);
  return date.toISOString().slice(0, 10);
}

export function TimelineDashboard({ snapshot, onOpenItem }: DashboardProps) {
  const currentDate = useSyncExternalStore(
    subscribeToCurrentDate,
    getCurrentDateSnapshot,
    getCurrentDateServerSnapshot,
  );
  const [modeValue, setModeValue] = useUrlFilter("view", "agenda");
  const mode = TIMELINE_MODES.some((option) => option.id === modeValue)
    ? (modeValue as (typeof TIMELINE_MODES)[number]["id"])
    : "agenda";
  const setMode = (value: (typeof TIMELINE_MODES)[number]["id"]) =>
    setModeValue(value);
  const [anchor, setAnchor] = useUrlFilter("anchor", todayIso());
  const [projectId, setProjectId] = useUrlFilter("project", "all");
  const [collectionId, setCollectionId] = useUrlFilter("collection", "all");
  const [type, setType] = useUrlFilter("type", "all");
  const [taskStatus, setTaskStatus] = useUrlFilter("status", "all");
  const [dateFrom, setDateFrom] = useUrlFilter("from", "");
  const [dateTo, setDateTo] = useUrlFilter("to", "");
  const [orderValue, setOrderValue] = useUrlFilter("order", "desc");
  const order = normalizeAgendaSortOrder(orderValue);
  const visibleCollections = snapshot.collections.filter(
    (collection) => projectId === "all" || collection.projectId === projectId,
  );
  const entries = useMemo(
    () =>
      projectTimeline(snapshot.items).filter(
        (item) =>
          (projectId === "all" || item.projectId === projectId) &&
          (collectionId === "all" || item.collectionId === collectionId) &&
          (type === "all" || item.type === type) &&
          (taskStatus === "all" ||
            (item.type === "task" && item.status === taskStatus)) &&
          (!dateFrom || item.date >= dateFrom) &&
          (!dateTo || item.date <= dateTo),
      ),
    [snapshot.items, projectId, collectionId, type, taskStatus, dateFrom, dateTo],
  );
  const agendaEntries = useMemo(
    () => (mode === "agenda" ? sortAgendaEntries(entries, order) : entries),
    [entries, mode, order],
  );
  const byDate = useMemo(() => {
    if (mode === "agenda") {
      return new Map<string, Array<WorkItemRecord & { date: string }>>();
    }
    const result = new Map<string, Array<WorkItemRecord & { date: string }>>();
    for (const entry of entries) {
      result.set(entry.date, [...(result.get(entry.date) ?? []), entry]);
    }
    return result;
  }, [entries, mode]);
  const agendaByDate = useMemo(() => {
    if (mode !== "agenda") {
      return new Map<string, Array<WorkItemRecord & { date: string }>>();
    }
    const result = new Map<string, Array<WorkItemRecord & { date: string }>>();
    for (const entry of agendaEntries) {
      result.set(entry.date, [...(result.get(entry.date) ?? []), entry]);
    }
    return result;
  }, [agendaEntries, mode]);
  const days = mode === "month" ? monthGrid(anchor) : weekGrid(anchor);

  return (
    <div className="dashboard-stack">
      <div className="timeline-toolbar">
        <div className="segmented-control" aria-label="Timeline view">
          {TIMELINE_MODES.map((option) => (
            <button key={option.id} type="button" className={mode === option.id ? "active" : ""} onClick={() => setMode(option.id)}>{option.label}</button>
          ))}
        </div>
        {mode !== "agenda" ? (
          <div className="timeline-period-controls">
            <button className="icon-button" type="button" aria-label="Previous period" onClick={() => setAnchor(shiftAnchor(anchor, mode, -1))}>‹</button>
            <button className="button button-secondary" type="button" onClick={() => setAnchor(todayIso())}>Today</button>
            <button className="icon-button" type="button" aria-label="Next period" onClick={() => setAnchor(shiftAnchor(anchor, mode, 1))}>›</button>
          </div>
        ) : null}
        <FilterSelect label="Filter timeline by project" value={projectId} onChange={(value) => { setProjectId(value); setCollectionId("all"); }}>
          <option value="all">All projects</option>
          {snapshot.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter timeline by collection" value={collectionId} onChange={setCollectionId}>
          <option value="all">All collections</option>
          {visibleCollections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter timeline by type" value={type} onChange={setType}>
          <option value="all">Tasks and events</option>
          <option value="task">Tasks only</option>
          <option value="event">Events only</option>
        </FilterSelect>
        <FilterSelect label="Filter timeline by task status" value={taskStatus} onChange={setTaskStatus}>
          <option value="all">Any task status</option>
          <option value="todo">To do</option>
          <option value="in_progress">In progress</option>
          <option value="done">Done</option>
        </FilterSelect>
        <FilterDate label="Timeline date from" value={dateFrom} onChange={setDateFrom} />
        <FilterDate label="Timeline date to" value={dateTo} onChange={setDateTo} />
      </div>
      {mode === "agenda" ? (
        <Panel
          title="Agenda"
          count={entries.length}
          action={
            <button
              className="icon-button agenda-sort-button"
              type="button"
              aria-label={
                order === "desc"
                  ? "Sort agenda oldest first"
                  : "Sort agenda latest first"
              }
              title={
                order === "desc"
                  ? "Sort agenda oldest first"
                  : "Sort agenda latest first"
              }
              onClick={() =>
                setOrderValue(order === "desc" ? "asc" : "desc")
              }
            >
              <span aria-hidden="true">{order === "desc" ? "↓" : "↑"}</span>
            </button>
          }
        >
          <div className="agenda-list">
            {[...agendaByDate.entries()].map(([date, items]) => (
              <section
                className={`agenda-day ${
                  isPastAgendaDate(date, currentDate) ? "agenda-day-past" : ""
                }`}
                key={date}
              >
                <header><strong>{prettyDate(date)}</strong><span>{items.length} item{items.length === 1 ? "" : "s"}</span></header>
                <div>
                  {items.map((item) => (
                    <button className={`agenda-item agenda-${item.type}`} type="button" key={item.id} onClick={() => onOpenItem(item.id)}>
                      <span>{item.type === "task" ? "Task" : "Event"}</span>
                      <WorkItemTitle item={item} />
                      <small>
                        {workItemMetadata(
                          [
                            projectName(snapshot, item.projectId),
                            collectionName(snapshot, item.collectionId),
                          ],
                          item.id,
                          snapshot.relations,
                          snapshot.items,
                        )}
                      </small>
                    </button>
                  ))}
                </div>
              </section>
            ))}
            {!entries.length ? <EmptyState title="Nothing on the timeline" description="Dated tasks and events will appear in chronological order." /> : null}
          </div>
        </Panel>
      ) : (
        <section className={`calendar-grid calendar-${mode}`} aria-label={`${mode} timeline`}>
          {days.map((date) => (
            <div className={`calendar-day ${date === todayIso() ? "today" : ""} ${mode === "month" && date.slice(0, 7) !== anchor.slice(0, 7) ? "outside" : ""}`} key={date}>
              <span className="calendar-date">{new Date(`${date}T00:00:00Z`).getUTCDate()}</span>
              <div className="calendar-items">
                {(byDate.get(date) ?? []).map((item) => {
                  const relationPhrases = relationMetadataPhrases(
                    item.id,
                    snapshot.relations,
                    snapshot.items,
                  );
                  return (
                    <button
                      type="button"
                      key={item.id}
                      className={`calendar-item calendar-${item.type}`}
                      onClick={() => onOpenItem(item.id)}
                    >
                      <span aria-hidden="true">
                        {item.type === "task" ? "✓" : "◷"}
                      </span>
                      <WorkItemTitle item={item} />
                      {relationPhrases.length ? (
                        <small>{relationPhrases.join(" · ")}</small>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
}

export function SpendingDashboard({ snapshot, onOpenItem }: DashboardProps) {
  const [projectId, setProjectId] = useUrlFilter("project", "all");
  const [collectionId, setCollectionId] = useUrlFilter("collection", "all");
  const [paymentFrom, setPaymentFrom] = useUrlFilter("from", "");
  const [paymentTo, setPaymentTo] = useUrlFilter("to", "");
  const visibleCollections = snapshot.collections.filter(
    (collection) => projectId === "all" || collection.projectId === projectId,
  );
  const baseItems = snapshot.items.filter(
    (item) =>
      (projectId === "all" || item.projectId === projectId) &&
      (collectionId === "all" || item.collectionId === collectionId),
  );
  const items = baseItems.map((item) => {
    const payments = item.payments.filter(
      (payment) =>
        (!paymentFrom || payment.paidOn >= paymentFrom) &&
        (!paymentTo || payment.paidOn <= paymentTo),
    );
    const actualSpendMinor = payments.reduce(
      (sum, payment) => sum + payment.amountMinor,
      0,
    );
    return {
      ...item,
      payments,
      actualSpendMinor,
      varianceMinor:
        item.estimatedCostMinor === null
          ? null
          : actualSpendMinor - item.estimatedCostMinor,
    };
  });
  const groups = summarizeSpending(
    items.map((item) => ({
      currency: projectCurrency(snapshot, item.projectId),
      estimatedMinor: item.estimatedCostMinor,
      actualMinor: item.actualSpendMinor,
    })),
  );
  const projectRows = snapshot.projects
    .filter((project) => projectId === "all" || project.id === projectId)
    .map((project) => {
      const projectItems = items.filter((item) => item.projectId === project.id);
      const summary = summarizeSpending(
        projectItems.map((item) => ({
          currency: project.currency,
          estimatedMinor: item.estimatedCostMinor,
          actualMinor: item.actualSpendMinor,
        })),
      )[0];
      return {
        project,
        estimated: summary?.estimatedMinor ?? 0,
        actual: summary?.actualMinor ?? 0,
        variance: summary?.varianceMinor ?? 0,
      };
    });
  const overEstimate = items.filter(
    (item) => item.estimatedCostMinor !== null && item.actualSpendMinor > item.estimatedCostMinor,
  );
  const recentPayments = items
    .flatMap((item) => item.payments.map((payment) => ({ item, payment })))
    .sort((a, b) => b.payment.paidOn.localeCompare(a.payment.paidOn))
    .slice(0, 8);
  const collectionRows = visibleCollections
    .filter((collection) => collectionId === "all" || collection.id === collectionId)
    .map((collection) => {
      const collectionItems = items.filter(
        (item) => item.collectionId === collection.id,
      );
      const project = snapshot.projects.find(
        (candidate) => candidate.id === collection.projectId,
      );
      const summary = summarizeSpending(
        collectionItems.map((item) => ({
          currency: project?.currency ?? "USD",
          estimatedMinor: item.estimatedCostMinor,
          actualMinor: item.actualSpendMinor,
        })),
      )[0];
      return { collection, project, summary };
    });

  return (
    <div className="dashboard-stack">
      <div className="filter-bar" aria-label="Spending filters">
        <FilterSelect label="Filter spending by project" value={projectId} onChange={(value) => { setProjectId(value); setCollectionId("all"); }}>
          <option value="all">All projects</option>
          {snapshot.projects.map((project) => <option value={project.id} key={project.id}>{project.name}</option>)}
        </FilterSelect>
        <FilterSelect label="Filter spending by collection" value={collectionId} onChange={setCollectionId}>
          <option value="all">All collections</option>
          {visibleCollections.map((collection) => <option value={collection.id} key={collection.id}>{collection.name}</option>)}
        </FilterSelect>
        <FilterDate label="Payment date from" value={paymentFrom} onChange={setPaymentFrom} />
        <FilterDate label="Payment date to" value={paymentTo} onChange={setPaymentTo} />
      </div>
      <div className="currency-groups">
        {groups.map((group) => (
          <section key={group.currency} className="currency-summary" aria-label={`${group.currency} spending summary`}>
            <header><h2>{group.currency}</h2><span>Currency group</span></header>
            <div className="metric-grid">
              <MetricCard label="Estimated" value={formatMoney(group.estimatedMinor, group.currency)} />
              <MetricCard label="Actual spend" value={formatMoney(group.actualMinor, group.currency)} accent="seafoam" />
              <MetricCard label="Variance" value={formatMoney(group.varianceMinor, group.currency)} accent={group.varianceMinor > 0 ? "warning" : "blue"} helper={group.varianceMinor > 0 ? "Over estimate" : "Within estimate"} />
            </div>
          </section>
        ))}
      </div>
      <div className="two-column-panels spending-panels">
        <Panel title="Project comparison" count={projectRows.length}>
          <div className="table-scroll">
            <table className="data-table">
              <thead><tr><th>Project</th><th>Estimated</th><th>Actual</th><th>Variance</th></tr></thead>
              <tbody>
                {projectRows.map(({ project, estimated, actual, variance }) => (
                  <tr key={project.id}>
                    <th scope="row">{project.name}<small>{project.currency}</small></th>
                    <td>{formatMoney(estimated, project.currency)}</td>
                    <td>{formatMoney(actual, project.currency)}</td>
                    <td className={variance > 0 ? "money-over" : "money-under"}>{formatMoney(variance, project.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Over estimate" count={overEstimate.length}>
          <div className="row-list compact-list">
            {overEstimate.map((item) => (
              <button className="money-row" type="button" key={item.id} onClick={() => onOpenItem(item.id)}>
                <span className="row-title">
                  <WorkItemTitle item={item} />
                  <small>
                    {workItemMetadata(
                      [projectName(snapshot, item.projectId)],
                      item.id,
                      snapshot.relations,
                      snapshot.items,
                    )}
                  </small>
                </span>
                <span className="money-over">+{formatMoney(item.varianceMinor ?? 0, projectCurrency(snapshot, item.projectId))}</span>
              </button>
            ))}
            {!overEstimate.length ? <EmptyState title="Everything is on estimate" description="Items above their estimate will be called out here." /> : null}
          </div>
        </Panel>
      </div>
      <Panel title="Collection breakdown" count={collectionRows.length}>
        <div className="table-scroll">
          <table className="data-table">
            <thead><tr><th>Collection</th><th>Project</th><th>Estimated</th><th>Actual</th><th>Variance</th></tr></thead>
            <tbody>
              {collectionRows.map(({ collection, project, summary }) => (
                <tr key={collection.id}>
                  <th scope="row">{collection.name}</th>
                  <td>{project?.name ?? "Project"}</td>
                  <td>{formatMoney(summary?.estimatedMinor ?? 0, project?.currency ?? "USD")}</td>
                  <td>{formatMoney(summary?.actualMinor ?? 0, project?.currency ?? "USD")}</td>
                  <td className={(summary?.varianceMinor ?? 0) > 0 ? "money-over" : "money-under"}>{formatMoney(summary?.varianceMinor ?? 0, project?.currency ?? "USD")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
      <Panel title="Recent payments" count={recentPayments.length}>
        <div className="payment-feed">
          {recentPayments.map(({ item, payment }) => (
            <button key={payment.id} type="button" onClick={() => onOpenItem(item.id)}>
              <span className="payment-date">{prettyDate(payment.paidOn)}</span>
              <span className="row-title"><strong>{payment.note || item.title}</strong><small>{item.title} · {projectName(snapshot, item.projectId)}</small></span>
              <strong>{formatMoney(payment.amountMinor, projectCurrency(snapshot, item.projectId))}</strong>
            </button>
          ))}
          {!recentPayments.length ? <EmptyState title="No payments yet" description="Actual spend appears after a payment is recorded on a task or event." /> : null}
        </div>
      </Panel>
    </div>
  );
}
