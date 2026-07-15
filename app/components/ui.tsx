"use client";

import {
  useEffect,
  useId,
  useRef,
  type FormEvent,
  type ReactNode,
} from "react";

export function Modal({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = "medium",
}: {
  open: boolean;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  onClose: () => void;
  size?: "small" | "medium" | "large";
}) {
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const frame = requestAnimationFrame(() => {
      panel.current
        ?.querySelector<HTMLElement>(
          "button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])",
        )
        ?.focus();
    });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("overlay-open");
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("overlay-open");
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay" role="presentation" onMouseDown={onClose}>
      <div
        ref={panel}
        className={`modal-panel modal-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="overlay-header">
          <div>
            <p className="eyebrow">Project Harbor</p>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close dialog">
            ×
          </button>
        </header>
        <div className="overlay-body">{children}</div>
        {footer ? <footer className="overlay-footer">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function Sheet({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [
        ...panel.current.querySelectorAll<HTMLElement>(
          "button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1'])",
        ),
      ];
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.classList.add("overlay-open");
    const frame = requestAnimationFrame(() =>
      panel.current?.querySelector<HTMLElement>("button,input,select,textarea")?.focus(),
    );
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKeyDown);
      document.body.classList.remove("overlay-open");
      previous?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="overlay sheet-overlay" role="presentation" onMouseDown={onClose}>
      <aside
        ref={panel}
        className="sheet-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="overlay-header">
          <h2 id={titleId}>{title}</h2>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close panel">
            ×
          </button>
        </header>
        <div className="sheet-content">{children}</div>
      </aside>
    </div>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {error ? <span className="field-error">{error}</span> : hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function FormActions({
  submitLabel,
  pending,
  onCancel,
}: {
  submitLabel: string;
  pending: boolean;
  onCancel: () => void;
}) {
  return (
    <div className="form-actions">
      <button className="button button-secondary" type="button" onClick={onCancel} disabled={pending}>
        Cancel
      </button>
      <button className="button button-primary" type="submit" disabled={pending}>
        {pending ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}

export function SubmitForm({
  children,
  onSubmit,
  className = "form-grid",
}: {
  children: ReactNode;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  className?: string;
}) {
  return (
    <form className={className} onSubmit={onSubmit} noValidate>
      {children}
    </form>
  );
}

export function MetricCard({
  label,
  value,
  accent = "cyan",
  helper,
  onClick,
}: {
  label: string;
  value: ReactNode;
  accent?: "cyan" | "seafoam" | "warning" | "blue";
  helper?: string;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className={`metric-mark metric-${accent}`} aria-hidden="true" />
      <span className="metric-copy">
        <strong>{value}</strong>
        <span>{label}</span>
        {helper ? <small>{helper}</small> : null}
      </span>
      {onClick ? <span className="metric-arrow" aria-hidden="true">›</span> : null}
    </>
  );
  return onClick ? (
    <button className="metric-card metric-button" type="button" onClick={onClick}>
      {content}
    </button>
  ) : (
    <div className="metric-card">{content}</div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <span className="empty-mark" aria-hidden="true">◇</span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export type ToastMessage = { id: string; message: string; tone: "success" | "error" | "info" };

export function ToastRegion({ messages }: { messages: ToastMessage[] }) {
  return (
    <div className="toast-region" aria-live="polite" aria-atomic="false">
      {messages.map((message) => (
        <div key={message.id} className={`toast toast-${message.tone}`}>
          {message.message}
        </div>
      ))}
    </div>
  );
}
