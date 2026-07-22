"use client";

import {
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type ReactNode,
} from "react";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth-paths";
import type { AppUser, ProjectRecord } from "@/lib/domain";
import { formatCurrentDate } from "./current-date";
import { ProjectMenu } from "./project-menu";
import { Field, FormActions, Modal, Sheet, SubmitForm } from "./ui";

export type AppRoute = "overview" | "tasks" | "events" | "timeline" | "spending" | "project";

type ProjectActionDialog =
  | { kind: "rename"; project: ProjectRecord }
  | { kind: "delete"; project: ProjectRecord }
  | null;

const NAV_ITEMS: Array<{ route: AppRoute; label: string; mark: string }> = [
  { route: "overview", label: "Overview", mark: "⌂" },
  { route: "tasks", label: "Tasks", mark: "✓" },
  { route: "events", label: "Events", mark: "◷" },
  { route: "timeline", label: "Timeline", mark: "▦" },
  { route: "spending", label: "Spending", mark: "$" },
];

const MOBILE_ITEMS: Array<{ route: AppRoute | "more"; label: string; mark: string }> = [
  { route: "overview", label: "Overview", mark: "⌂" },
  { route: "tasks", label: "Tasks", mark: "✓" },
  { route: "events", label: "Events", mark: "◷" },
  { route: "timeline", label: "Timeline", mark: "▦" },
  { route: "more", label: "More", mark: "•••" },
];

let cachedCurrentDate = "";

const subscribeToCurrentDate = (onStoreChange: () => void) => {
  if (cachedCurrentDate === "") {
    cachedCurrentDate = formatCurrentDate(new Date());
    queueMicrotask(onStoreChange);
  }
  return () => {};
};
const getCurrentDateSnapshot = () => cachedCurrentDate;
const getCurrentDateServerSnapshot = () => "";

export function AppShell({
  user,
  projects,
  route,
  activeProjectId,
  title,
  actionLabel,
  children,
  onRouteChange,
  onProjectSelect,
  onProjectRename,
  onProjectExport,
  onProjectDelete,
  exportingProjectId,
  projectMutationPending,
  onPrimaryAction,
}: {
  user: AppUser;
  projects: ProjectRecord[];
  route: AppRoute;
  activeProjectId: string | null;
  title: string;
  actionLabel: string;
  children: ReactNode;
  onRouteChange: (route: AppRoute) => void;
  onProjectSelect: (projectId: string) => void;
  onProjectRename: (projectId: string, name: string) => Promise<void>;
  onProjectExport: (projectId: string) => Promise<void>;
  onProjectDelete: (projectId: string) => Promise<void>;
  exportingProjectId: string | null;
  projectMutationPending: boolean;
  onPrimaryAction: () => void;
}) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [projectAction, setProjectAction] =
    useState<ProjectActionDialog>(null);
  const currentDate = useSyncExternalStore(
    subscribeToCurrentDate,
    getCurrentDateSnapshot,
    getCurrentDateServerSnapshot,
  );
  const initials = useMemo(
    () =>
      user.displayName
        .split(/\s+/)
        .slice(0, 2)
        .map((part) => part[0])
        .join("")
        .toUpperCase(),
    [user.displayName],
  );

  const navigate = (next: AppRoute) => {
    setMobileMoreOpen(false);
    onRouteChange(next);
  };

  const openProjectAction = (
    kind: Exclude<ProjectActionDialog, null>["kind"],
    project: ProjectRecord,
  ) => {
    setMobileMoreOpen(false);
    setProjectAction({ kind, project });
  };

  const submitProjectRename = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (projectAction?.kind !== "rename") return;
    const data = new FormData(event.currentTarget);
    try {
      await onProjectRename(
        projectAction.project.id,
        String(data.get("name") ?? ""),
      );
      setProjectAction(null);
    } catch {
      // HarborApp reports mutation failures in the shared toast region.
    }
  };

  const deleteProject = async () => {
    if (projectAction?.kind !== "delete") return;
    try {
      await onProjectDelete(projectAction.project.id);
      setProjectAction(null);
    } catch {
      // HarborApp reports mutation failures in the shared toast region.
    }
  };

  return (
    <div className="app-frame">
      <aside className="desktop-sidebar" aria-label="Primary navigation">
        <button className="brand" type="button" onClick={() => navigate("overview")}>
          <span className="brand-mark" aria-hidden="true">⚓</span>
          <span className="brand-copy">
            <span>Project Harbor</span>
            {currentDate ? <span className="brand-date">{currentDate}</span> : null}
          </span>
        </button>
        <nav className="sidebar-nav">
          <p className="nav-heading">Navigation</p>
          {NAV_ITEMS.map((item) => (
            <button
              type="button"
              key={item.route}
              className={`nav-item ${route === item.route ? "active" : ""}`}
              aria-current={route === item.route ? "page" : undefined}
              onClick={() => navigate(item.route)}
            >
              <span aria-hidden="true">{item.mark}</span>
              {item.label}
            </button>
          ))}
        </nav>
        <div className="project-nav">
          <p className="nav-heading">Projects</p>
          {projects.map((project) => (
            <div className="project-nav-row" key={project.id}>
              <button
                type="button"
                className={`nav-item project-nav-item ${route === "project" && activeProjectId === project.id ? "active-project" : ""}`}
                onClick={() => onProjectSelect(project.id)}
              >
                <span className="project-dot" aria-hidden="true" />
                <span>{project.name}</span>
              </button>
              <ProjectMenu
                project={project}
                busy={
                  exportingProjectId === project.id || projectMutationPending
                }
                onRename={(selectedProject) =>
                  openProjectAction("rename", selectedProject)
                }
                onExport={onProjectExport}
                onDelete={(selectedProject) =>
                  openProjectAction("delete", selectedProject)
                }
              />
            </div>
          ))}
        </div>
        <div className="sidebar-user">
          <div className="avatar" aria-hidden="true">{initials}</div>
          <div className="user-copy">
            <strong>{user.displayName}</strong>
            <span>{user.email}</span>
          </div>
          <a className="signout-link" href={chatGPTSignOutPath("/")} aria-label="Sign out">↗</a>
        </div>
      </aside>

      <div className="workspace-shell">
        <header className="mobile-header">
          <button className="mobile-brand" type="button" onClick={() => navigate("overview")} aria-label="Go to overview">
            <span aria-hidden="true">⚓</span>
            Harbor
          </button>
          <button className="button button-primary mobile-create" type="button" onClick={onPrimaryAction}>
            + Create
          </button>
        </header>
        <header className="workspace-header">
          <div>
            <p className="eyebrow">Workspace</p>
            <h1>{title}</h1>
          </div>
          <div className="header-actions">
            <button className="button button-primary" type="button" onClick={onPrimaryAction}>
              + {actionLabel}
            </button>
          </div>
        </header>
        <main className="workspace-main">{children}</main>
      </div>

      <nav className="mobile-nav" aria-label="Mobile navigation">
        {MOBILE_ITEMS.map((item) => (
          <button
            type="button"
            key={item.route}
            className={item.route !== "more" && route === item.route ? "active" : ""}
            aria-current={item.route !== "more" && route === item.route ? "page" : undefined}
            onClick={() => (item.route === "more" ? setMobileMoreOpen(true) : navigate(item.route))}
          >
            <span aria-hidden="true">{item.mark}</span>
            <small>{item.label}</small>
          </button>
        ))}
      </nav>

      <Sheet open={mobileMoreOpen} title="More" onClose={() => setMobileMoreOpen(false)}>
        <div className="mobile-more-list">
          <button type="button" onClick={() => navigate("spending")}>$ <span>Spending</span></button>
          <p className="nav-heading">Projects</p>
          {projects.map((project) => (
            <div className="mobile-project-row" key={project.id}>
              <button type="button" onClick={() => { setMobileMoreOpen(false); onProjectSelect(project.id); }}>
                <span className="project-dot" aria-hidden="true" />
                <span>{project.name}</span>
              </button>
              <ProjectMenu
                project={project}
                busy={
                  exportingProjectId === project.id || projectMutationPending
                }
                onRename={(selectedProject) =>
                  openProjectAction("rename", selectedProject)
                }
                onExport={onProjectExport}
                onDelete={(selectedProject) =>
                  openProjectAction("delete", selectedProject)
                }
              />
            </div>
          ))}
          <a href={chatGPTSignOutPath("/")}>↗ <span>Sign out</span></a>
        </div>
      </Sheet>

      <Modal
        open={projectAction?.kind === "rename"}
        title="Rename project"
        description="Choose a new name for this project."
        onClose={() => {
          if (!projectMutationPending) setProjectAction(null);
        }}
        size="small"
      >
        {projectAction?.kind === "rename" ? (
          <SubmitForm onSubmit={submitProjectRename}>
            <Field label="Project name">
              <input
                name="name"
                defaultValue={projectAction.project.name}
                required
                maxLength={120}
              />
            </Field>
            <FormActions
              submitLabel="Rename project"
              pending={projectMutationPending}
              onCancel={() => setProjectAction(null)}
            />
          </SubmitForm>
        ) : null}
      </Modal>

      <Modal
        open={projectAction?.kind === "delete"}
        title="Delete project"
        description="This permanently removes the project and everything in it."
        onClose={() => {
          if (!projectMutationPending) setProjectAction(null);
        }}
        size="small"
      >
        {projectAction?.kind === "delete" ? (
          <>
            <p className="confirmation-copy">
              Delete <strong>{projectAction.project.name}</strong>? This cannot
              be undone.
            </p>
            <div className="form-actions">
              <button
                className="button button-secondary"
                type="button"
                disabled={projectMutationPending}
                onClick={() => setProjectAction(null)}
              >
                Cancel
              </button>
              <button
                className="button button-danger"
                type="button"
                disabled={projectMutationPending}
                onClick={() => void deleteProject()}
              >
                {projectMutationPending ? "Deleting…" : "Delete project"}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
