"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import type { ProjectRecord } from "@/lib/domain";

export function ProjectMenu({
  project,
  busy,
  onExport,
}: {
  project: ProjectRecord;
  busy: boolean;
  onExport: (projectId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() =>
      menuRef.current?.querySelector<HTMLButtonElement>(
        '[role="menuitem"]:not([disabled])',
      )?.focus(),
    );
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (busy) setOpen(false);
  }, [busy]);

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
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setOpen(true);
          }
          if (event.key === "Escape" && open) {
            event.preventDefault();
            close(true);
          }
        }}
      >
        <span aria-hidden="true">•••</span>
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          className="project-context-menu"
          role="menu"
          aria-label={`Actions for ${project.name}`}
          onKeyDown={handleMenuKeyDown}
        >
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
        </div>
      ) : null}
    </div>
  );
}
