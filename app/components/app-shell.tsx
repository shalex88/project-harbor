"use client";

import { useMemo, useState, type ReactNode } from "react";
import { chatGPTSignOutPath } from "@/app/chatgpt-auth-paths";
import type { AppUser, ProjectRecord } from "@/lib/domain";
import { Sheet } from "./ui";

export type AppRoute = "overview" | "tasks" | "events" | "timeline" | "spending" | "project";

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
  onPrimaryAction: () => void;
}) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
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

  return (
    <div className="app-frame">
      <aside className="desktop-sidebar" aria-label="Primary navigation">
        <button className="brand" type="button" onClick={() => navigate("overview")}>
          <span className="brand-mark" aria-hidden="true">⚓</span>
          <span>Project Harbor</span>
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
            <button
              type="button"
              key={project.id}
              className={`nav-item project-nav-item ${route === "project" && activeProjectId === project.id ? "active-project" : ""}`}
              onClick={() => onProjectSelect(project.id)}
            >
              <span className="project-dot" aria-hidden="true" />
              <span>{project.name}</span>
              <small>{project.currency}</small>
            </button>
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
            <button key={project.id} type="button" onClick={() => { setMobileMoreOpen(false); onProjectSelect(project.id); }}>
              <span className="project-dot" aria-hidden="true" />
              <span>{project.name}</span>
              <small>{project.currency}</small>
            </button>
          ))}
          <a href={chatGPTSignOutPath("/")}>↗ <span>Sign out</span></a>
        </div>
      </Sheet>
    </div>
  );
}
