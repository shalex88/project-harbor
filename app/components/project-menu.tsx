"use client";

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import type { ProjectRecord } from "@/lib/domain";
import { calculateProjectMenuPosition } from "./project-menu-position";

const PROJECT_MENU_OPEN_EVENT = "project-menu:open";

function announceProjectMenuOpen(menuId: string) {
  window.dispatchEvent(
    new CustomEvent(PROJECT_MENU_OPEN_EVENT, { detail: { menuId } }),
  );
}

export function ProjectMenu({
  project,
  busy,
  onRename,
  onExport,
  onDelete,
}: {
  project: ProjectRecord;
  busy: boolean;
  onRename: (project: ProjectRecord) => void;
  onExport: (projectId: string) => Promise<void>;
  onDelete: (project: ProjectRecord) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const position = calculateProjectMenuPosition({
        trigger: trigger.getBoundingClientRect(),
        menu: menu.getBoundingClientRect(),
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

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const openMenu = () => {
    announceProjectMenuOpen(menuId);
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      )?.focus(),
    );
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        close();
      }
    };
    const onProjectMenuOpen = (event: Event) => {
      if (
        event instanceof CustomEvent &&
        event.detail?.menuId !== menuId
      ) {
        close();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener(PROJECT_MENU_OPEN_EVENT, onProjectMenuOpen);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener(PROJECT_MENU_OPEN_EVENT, onProjectMenuOpen);
    };
  }, [open, menuId]);

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    }
    let offset: number;
    if (event.key === "ArrowDown") {
      offset = 1;
    } else if (event.key === "ArrowUp") {
      offset = -1;
    } else {
      return;
    }
    event.preventDefault();
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      ) ?? []),
    ];
    if (!items.length) return;
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = (currentIndex + offset + items.length) % items.length;
    items[nextIndex]?.focus();
  };

  const menuContent = open ? (
    <div
      id={menuId}
      ref={menuRef}
      className="project-context-menu"
      role="menu"
      aria-label={`Actions for ${project.name}`}
      onKeyDown={handleMenuKeyDown}
    >
      {project.role === "owner" ? (
        <button
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => {
            close();
            onRename(project);
          }}
        >
          <span aria-hidden="true">✎</span>
          Rename project
        </button>
      ) : null}
      <button
        type="button"
        role="menuitem"
        disabled={busy}
        onClick={() => {
          close();
          void onExport(project.id);
        }}
      >
        <span aria-hidden="true">⇩</span>
        Export project
      </button>
      {project.role === "owner" ? (
        <button
          className="project-menu-danger"
          type="button"
          role="menuitem"
          disabled={busy}
          onClick={() => {
            close();
            onDelete(project);
          }}
        >
          <span aria-hidden="true">×</span>
          Delete project
        </button>
      ) : null}
    </div>
  ) : null;

  return (
    <div className="project-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="project-menu-trigger"
        type="button"
        aria-label={`More actions for ${project.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={busy}
        onClick={() => {
          if (open) {
            close();
          } else {
            openMenu();
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openMenu();
          }
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close(true);
          }
        }}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {menuContent ? createPortal(menuContent, document.body) : null}
    </div>
  );
}
