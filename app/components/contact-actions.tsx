"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { ContactRecord } from "@/lib/domain";
import { Modal } from "./ui";

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
        <div className="contact-detail-actions">
          {contact.phone ? (
            <a className="button button-secondary" href={`tel:${contact.phone}`}>
              Call
            </a>
          ) : null}
          {contact.email ? (
            <a className="button button-secondary" href={`mailto:${contact.email}`}>
              Email
            </a>
          ) : null}
          {!contact.phone && !contact.email ? (
            <span className="muted">No phone number or email address</span>
          ) : null}
        </div>
        {contact.phone ? (
          <p>
            <span>Phone</span>
            <bdi dir="ltr">{contact.phone}</bdi>
          </p>
        ) : null}
        {contact.email ? (
          <p>
            <span>Email</span>
            <bdi dir="ltr">{contact.email}</bdi>
          </p>
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
  const menuId = useId();
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  const restoreTriggerFocus = () => {
    requestAnimationFrame(() => triggerRef.current?.focus());
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
    const frame = requestAnimationFrame(positionMenu);
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
  }, [menuOpen]);

  const stopRowActivation = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  return (
    <span className="contact-action" ref={containerRef}>
      <button
        ref={triggerRef}
        className={className ?? "contact-mention-trigger"}
        type="button"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-controls={menuOpen ? menuId : undefined}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
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
            <a role="menuitem" href={`tel:${contact.phone}`} onClick={stopRowActivation}>
              Call
            </a>
          ) : null}
          {contact.email ? (
            <a role="menuitem" href={`mailto:${contact.email}`} onClick={stopRowActivation}>
              Email
            </a>
          ) : null}
          <button
            type="button"
            role="menuitem"
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
