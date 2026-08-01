"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ContactRecord } from "@/lib/domain";
import { Modal } from "./ui";

const ISRAEL_COUNTRY_CODE = "972";

export function whatsappMessageHref(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;

  let internationalNumber = digits;
  if (trimmed.startsWith("00")) {
    internationalNumber = digits.slice(2);
  } else if (!trimmed.startsWith("+") && digits.startsWith("0")) {
    internationalNumber = `${ISRAEL_COUNTRY_CODE}${digits.slice(1)}`;
  }

  return internationalNumber
    ? `https://wa.me/${internationalNumber}`
    : null;
}

export function ContactDetailsModal({
  contact,
  open,
  onClose,
}: {
  contact: ContactRecord;
  open: boolean;
  onClose: () => void;
}): ReactElement | null {
  return (
    <Modal
      open={open}
      title="Contact details"
      description="Current details from this project's contacts."
      onClose={onClose}
      size="small"
      footer={
        <button className="button button-primary" type="button" onClick={onClose}>
          Close
        </button>
      }
    >
      <div className="contact-details-modal">
        <div>
          <strong>
            <bdi dir="auto">{contact.name}</bdi>
          </strong>
          {contact.roleOrCompany ? (
            <span>
              <bdi dir="auto">{contact.roleOrCompany}</bdi>
            </span>
          ) : null}
        </div>
        {contact.phone ? (
          <p>
            <span>Phone</span>
            <a href={`tel:${contact.phone}`}>
              <bdi dir="ltr">{contact.phone}</bdi>
            </a>
          </p>
        ) : null}
        {contact.email ? (
          <p>
            <span>Email</span>
            <a href={`mailto:${contact.email}`}>
              <bdi dir="ltr">{contact.email}</bdi>
            </a>
          </p>
        ) : null}
        {!contact.phone && !contact.email ? (
          <span className="muted">No phone number or email address</span>
        ) : null}
        {contact.notes ? (
          <p>
            <span>Notes</span>
            <bdi dir="auto">{contact.notes}</bdi>
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

export function ContactActionTrigger({
  contact,
  label,
  className,
}: {
  contact: ContactRecord;
  label: ReactNode;
  className?: string;
}): ReactElement {
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const containerRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLSpanElement>(null);
  const pendingMenuFocus = useRef<"first" | "last">("first");
  const menuId = useId();
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const restoreTriggerFocus = () => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const menuItems = useCallback(
    (): HTMLElement[] =>
      menuRef.current
        ? [
            ...menuRef.current.querySelectorAll<HTMLElement>(
              "[role='menuitem']",
            ),
          ]
        : [],
    [],
  );

  const focusMenuItem = useCallback(
    (index: number) => {
      const items = menuItems();
      if (!items.length) return;
      items[(index + items.length) % items.length]?.focus();
    },
    [menuItems],
  );

  const focusAdjacentControl = (backward: boolean) => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const scope = trigger.closest<HTMLElement>("[role='dialog']") ?? document;
    const controls = [
      ...scope.querySelectorAll<HTMLElement>(
        "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[contenteditable='true'],[tabindex]",
      ),
    ].filter(
      (control) =>
        control.tabIndex >= 0 &&
        !menuRef.current?.contains(control) &&
        control.getClientRects().length > 0,
    );
    const triggerIndex = controls.indexOf(trigger);
    if (triggerIndex < 0 || controls.length < 2) {
      restoreTriggerFocus();
      return;
    }
    const nextIndex =
      (triggerIndex + (backward ? -1 : 1) + controls.length) %
      controls.length;
    requestAnimationFrame(() => controls[nextIndex]?.focus());
  };

  useEffect(() => {
    if (!menuOpen) return;
    const positionMenu = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const triggerBox = trigger.getBoundingClientRect();
      const menuBox = menu.getBoundingClientRect();
      const margin = 12;
      const gap = 7;
      const left = Math.min(
        Math.max(triggerBox.left, margin),
        Math.max(margin, window.innerWidth - menuBox.width - margin),
      );
      const below = triggerBox.bottom + gap;
      const above = triggerBox.top - menuBox.height - gap;
      const top =
        below + menuBox.height <= window.innerHeight - margin
          ? below
          : Math.max(margin, above);
      setMenuPosition({ top, left });
    };
    const frame = requestAnimationFrame(() => {
      positionMenu();
      const items = menuItems();
      focusMenuItem(pendingMenuFocus.current === "last" ? items.length - 1 : 0);
    });
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        !containerRef.current?.contains(target) &&
        !menuRef.current?.contains(target)
      ) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setMenuOpen(false);
        restoreTriggerFocus();
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [focusMenuItem, menuItems, menuOpen]);

  const stopRowActivation = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    const items = menuItems();
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      focusMenuItem(currentIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      focusMenuItem(currentIndex - 1);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusMenuItem(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusMenuItem(items.length - 1);
    } else if (event.key === "Tab") {
      event.preventDefault();
      setMenuOpen(false);
      focusAdjacentControl(event.shiftKey);
    }
  };
  const messageHref = contact.phone
    ? whatsappMessageHref(contact.phone)
    : null;

  return (
    <span className="contact-action" ref={containerRef}>
      <button
        ref={triggerRef}
        className={className ?? "contact-mention-trigger"}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            event.stopPropagation();
            pendingMenuFocus.current =
              event.key === "ArrowUp" ? "last" : "first";
            setMenuOpen(true);
          }
        }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          pendingMenuFocus.current = "first";
          setMenuOpen((current) => !current);
        }}
      >
        <bdi dir="auto">{label}</bdi>
      </button>
      {menuOpen && typeof document !== "undefined" ? createPortal(
        <span
          id={menuId}
          ref={menuRef}
          className="contact-action-popover"
          role="menu"
          aria-label={`Contact actions for ${contact.name}`}
          style={{ top: menuPosition.top, left: menuPosition.left }}
          onClick={stopRowActivation}
          onKeyDown={handleMenuKeyDown}
        >
          <strong>
            <bdi dir="auto">{contact.name}</bdi>
          </strong>
          {contact.roleOrCompany ? (
            <small>
              <bdi dir="auto">{contact.roleOrCompany}</bdi>
            </small>
          ) : null}
          {contact.phone ? (
            <a
              role="menuitem"
              tabIndex={-1}
              href={`tel:${contact.phone}`}
              onClick={(event) => {
                stopRowActivation(event);
                setMenuOpen(false);
              }}
            >
              Call
            </a>
          ) : null}
          {messageHref ? (
            <a
              role="menuitem"
              tabIndex={-1}
              href={messageHref}
              target="_blank"
              rel="noreferrer"
              aria-label={`Message ${contact.name} on WhatsApp`}
              onClick={(event) => {
                stopRowActivation(event);
                setMenuOpen(false);
              }}
            >
              Message
            </a>
          ) : null}
          {contact.email ? (
            <a
              role="menuitem"
              tabIndex={-1}
              href={`mailto:${contact.email}`}
              onClick={(event) => {
                stopRowActivation(event);
                setMenuOpen(false);
              }}
            >
              Email
            </a>
          ) : null}
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setMenuOpen(false);
              setDetailsOpen(true);
            }}
          >View contact</button>
        </span>,
        document.body,
      ) : null}
      {detailsOpen && typeof document !== "undefined"
        ? createPortal(
            <ContactDetailsModal
              contact={contact}
              open={detailsOpen}
              onClose={() => {
                setDetailsOpen(false);
                restoreTriggerFocus();
              }}
            />,
            document.body,
          )
        : null}
    </span>
  );
}
