"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactElement,
  type ReactNode,
} from "react";
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

  const restoreTriggerFocus = () => {
    requestAnimationFrame(() => triggerRef.current?.focus());
  };

  useEffect(() => {
    if (!menuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
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
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
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
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setMenuOpen((current) => !current);
        }}
      >
        <bdi dir="auto">{label}</bdi>
      </button>
      {menuOpen ? (
        <span
          className="contact-action-popover"
          role="menu"
          aria-label={`Contact actions for ${contact.name}`}
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
        </span>
      ) : null}
      <ContactDetailsModal
        contact={contact}
        open={detailsOpen}
        onClose={() => {
          setDetailsOpen(false);
          restoreTriggerFocus();
        }}
      />
    </span>
  );
}
