"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { nextFollowUpMenuIndex } from "./follow-up-menu-navigation";

type FollowUpType = "task" | "event";

export function FollowUpMenu({
  disabled = false,
  onSelect,
}: {
  disabled?: boolean;
  onSelect: (type: FollowUpType) => void;
}) {
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pendingFocusIndex = useRef(0);

  const dismiss = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => triggerRef.current?.focus());
    }
  };

  const openMenu = (focusIndex: number) => {
    pendingFocusIndex.current = focusIndex;
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => {
      const items = menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      );
      items?.[pendingFocusIndex.current]?.focus();
    });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!containerRef.current?.contains(target)) {
        dismiss(true);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open]);

  const select = (type: FollowUpType) => {
    setOpen(false);
    onSelect(type);
  };

  const handleMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss(true);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    const items = [
      ...(menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]',
      ) ?? []),
    ];
    const currentIndex = Math.max(
      0,
      items.indexOf(document.activeElement as HTMLButtonElement),
    );
    const nextIndex = nextFollowUpMenuIndex(
      event.key,
      currentIndex,
      items.length,
    );
    if (nextIndex === null) return;
    event.preventDefault();
    items[nextIndex]?.focus();
  };

  return (
    <div className="follow-up-menu" ref={containerRef}>
      <button
        ref={triggerRef}
        className="button button-secondary"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => {
          if (open) {
            dismiss(false);
          } else {
            openMenu(0);
          }
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            openMenu(event.key === "ArrowUp" ? 1 : 0);
          } else if (event.key === "Escape" && open) {
            event.preventDefault();
            dismiss(true);
          }
        }}
      >
        Create follow-up
      </button>
      {open ? (
        <div
          id={menuId}
          ref={menuRef}
          className="follow-up-menu-popover"
          role="menu"
          aria-label="Create follow-up type"
          onKeyDown={handleMenuKeyDown}
        >
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => select("task")}><span>Task</span></button>
          <button type="button" role="menuitem" tabIndex={-1} onClick={() => select("event")}><span>Event</span></button>
        </div>
      ) : null}
    </div>
  );
}
