"use client";

import { useMemo, useState, type DragEvent, type FormEvent } from "react";
import {
  formatMoney,
  moneyInputValue,
  parseMoneyToMinor,
  type PaymentRecord,
  type WorkspaceMutation,
  type WorkspaceSnapshot,
} from "@/lib/domain";
import { EmptyState, Field, Modal, Sheet, SubmitForm } from "./ui";
import { ItemRelationsPanel } from "./item-relations";

export type ItemSheetMode =
  | { kind: "new"; type: "task" | "event"; collectionId: string }
  | { kind: "follow-up"; sourceEventId: string; collectionId: string }
  | { kind: "existing"; itemId: string }
  | null;

type FileTarget = { itemId?: string; paymentId?: string };

export function ItemSheet({
  snapshot,
  mode,
  pending,
  uploadProgress,
  onClose,
  onMutate,
  onOpenItem,
  onStartFollowUp,
  onUpload,
  onTogglePin,
  onDeleteFile,
}: {
  snapshot: WorkspaceSnapshot;
  mode: ItemSheetMode;
  pending: boolean;
  uploadProgress: number | null;
  onClose: () => void;
  onMutate: (mutation: WorkspaceMutation) => Promise<WorkspaceSnapshot>;
  onOpenItem: (itemId: string) => void;
  onStartFollowUp: (sourceEventId: string, collectionId: string) => void;
  onUpload: (target: FileTarget, file: File) => Promise<void>;
  onTogglePin: (itemFileId: string, pinned: boolean) => Promise<void>;
  onDeleteFile: (fileObjectId: string) => Promise<void>;
}) {
  const key =
    mode?.kind === "existing"
      ? mode.itemId
      : mode?.kind === "follow-up"
        ? `follow-up-${mode.sourceEventId}-${mode.collectionId}`
        : mode
          ? `new-${mode.type}-${mode.collectionId}`
          : "closed";
  const title =
    mode?.kind === "existing"
      ? "Item details"
      : mode?.kind === "follow-up"
        ? "New follow-up task"
        : mode?.type === "event"
          ? "New event"
          : "New task";
  return (
    <Sheet open={Boolean(mode)} title={title} onClose={onClose}>
      {mode ? (
        <ItemSheetContent
          key={key}
          snapshot={snapshot}
          mode={mode}
          pending={pending}
          uploadProgress={uploadProgress}
          onClose={onClose}
          onMutate={onMutate}
          onOpenItem={onOpenItem}
          onStartFollowUp={onStartFollowUp}
          onUpload={onUpload}
          onTogglePin={onTogglePin}
          onDeleteFile={onDeleteFile}
        />
      ) : null}
    </Sheet>
  );
}

function ItemSheetContent({
  snapshot,
  mode,
  pending,
  uploadProgress,
  onClose,
  onMutate,
  onOpenItem,
  onStartFollowUp,
  onUpload,
  onTogglePin,
  onDeleteFile,
}: {
  snapshot: WorkspaceSnapshot;
  mode: Exclude<ItemSheetMode, null>;
  pending: boolean;
  uploadProgress: number | null;
  onClose: () => void;
  onMutate: (mutation: WorkspaceMutation) => Promise<WorkspaceSnapshot>;
  onOpenItem: (itemId: string) => void;
  onStartFollowUp: (sourceEventId: string, collectionId: string) => void;
  onUpload: (target: FileTarget, file: File) => Promise<void>;
  onTogglePin: (itemFileId: string, pinned: boolean) => Promise<void>;
  onDeleteFile: (fileObjectId: string) => Promise<void>;
}) {
  const item = mode.kind === "existing" ? snapshot.items.find((candidate) => candidate.id === mode.itemId) ?? null : null;
  const sourceEvent =
    mode.kind === "follow-up"
      ? snapshot.items.find(
          (candidate) =>
            candidate.id === mode.sourceEventId && candidate.type === "event",
        ) ?? null
      : null;
  const type = item?.type ?? (mode.kind === "new" ? mode.type : "task");
  const collectionId = item?.collectionId ?? (mode.kind === "new" || mode.kind === "follow-up" ? mode.collectionId : "");
  const collection = snapshot.collections.find((candidate) => candidate.id === collectionId);
  const project = snapshot.projects.find((candidate) => candidate.id === (item?.projectId ?? sourceEvent?.projectId ?? collection?.projectId));
  const [tab, setTab] = useState<"details" | "files" | "payments" | "relations">("details");
  const [localError, setLocalError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [editingPayment, setEditingPayment] = useState<PaymentRecord | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const currency = project?.currency ?? "USD";

  const pinnedFiles = useMemo(
    () => [...(item?.files ?? [])].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.createdAt.localeCompare(a.createdAt)),
    [item?.files],
  );

  if (mode.kind === "existing" && !item) {
    return <EmptyState title="Item unavailable" description="It may have been removed or moved while this panel was open." />;
  }
  if (mode.kind === "follow-up" && !sourceEvent) {
    return <EmptyState title="Source event unavailable" description="It may have been removed while this panel was open." />;
  }

  const handleItemSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLocalError("");
    try {
      const data = new FormData(event.currentTarget);
      const estimate = parseMoneyToMinor(
        String(data.get("estimatedCost") ?? ""),
        currency,
      );
      if (type === "task") {
        const common = {
          type: "task" as const,
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          status: String(data.get("status") ?? "todo") as "todo" | "done",
          dueDate: String(data.get("dueDate") ?? "") || null,
          estimatedCostMinor: estimate,
        };
        if (mode.kind === "follow-up" && sourceEvent) {
          await onMutate({
            action: "create_follow_up_task",
            sourceEventId: sourceEvent.id,
            collectionId: String(data.get("collectionId") ?? collectionId),
            title: common.title,
            description: common.description,
            status: common.status,
            dueDate: common.dueDate,
            estimatedCostMinor: common.estimatedCostMinor,
          });
        } else {
          await onMutate(
            item
              ? { action: "update_item", itemId: item.id, ...common }
              : { action: "create_item", collectionId, ...common },
          );
        }
      } else {
        const common = {
          type: "event" as const,
          title: String(data.get("title") ?? ""),
          description: String(data.get("description") ?? ""),
          occurrenceDate: String(data.get("occurrenceDate") ?? ""),
          estimatedCostMinor: estimate,
        };
        await onMutate(
          item
            ? { action: "update_item", itemId: item.id, ...common }
            : { action: "create_item", collectionId, ...common },
        );
      }
      if (!item && mode.kind === "new") onClose();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to save the item");
    }
  };

  const uploadItemFile = async (file: File | undefined) => {
    if (!file || !item) return;
    setLocalError("");
    try {
      await onUpload({ itemId: item.id }, file);
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Upload failed");
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragActive(false);
    void uploadItemFile(event.dataTransfer.files[0]);
  };

  const handlePayment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!item) return;
    const form = event.currentTarget;
    setLocalError("");
    try {
      const data = new FormData(event.currentTarget);
      const amountMinor = parseMoneyToMinor(
        String(data.get("amount") ?? ""),
        currency,
      );
      if (amountMinor === null || amountMinor <= 0) throw new Error("Enter a payment amount greater than zero");
      const common = {
        amountMinor,
        paidOn: String(data.get("paidOn") ?? ""),
        note: String(data.get("note") ?? ""),
      };
      await onMutate(
        editingPayment
          ? { action: "update_payment", paymentId: editingPayment.id, ...common }
          : { action: "create_payment", itemId: item.id, ...common },
      );
      setEditingPayment(null);
      form.reset();
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : "Unable to save the payment");
    }
  };

  const canManagePayment = (payment: PaymentRecord) =>
    project?.role === "owner" || payment.createdBy === snapshot.user.id;

  const itemRelations = item
    ? snapshot.relations.filter(
        (relation) =>
          relation.sourceItemId === item.id || relation.targetItemId === item.id,
      )
    : [];

  return (
    <div className="item-sheet-stack">
      <div className="item-context">
        <span className={`item-kind kind-${type}`}>{type === "task" ? "Task" : "Event"}</span>
        <span>{project?.name ?? "Project"}</span>
        <span>·</span>
        <span>{collection?.name ?? "Collection"}</span>
      </div>

      {sourceEvent ? (
        <div className="follow-up-source">
          <span>Follows from</span>
          <strong>{sourceEvent.title}</strong>
        </div>
      ) : null}

      {item ? (
        <div className="item-tabs" role="tablist" aria-label="Item sections">
          {(["details", "files", "payments", "relations"] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={tab === value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>
              {value === "details"
                ? "Details"
                : value === "files"
                  ? `Files (${item.files.length})`
                  : value === "payments"
                    ? `Payments (${item.payments.length})`
                    : `Relations (${itemRelations.length})`}
            </button>
          ))}
        </div>
      ) : null}

      {localError ? <div className="inline-error" role="alert">{localError}</div> : null}

      {tab === "details" ? (
        <SubmitForm onSubmit={handleItemSubmit}>
          {mode.kind === "follow-up" && project ? (
            <Field label="Collection">
              <select name="collectionId" defaultValue={collectionId}>
                {snapshot.collections
                  .filter((candidate) => candidate.projectId === project.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}
          <Field label="Title"><input name="title" defaultValue={item?.title ?? ""} required maxLength={160} /></Field>
          <Field label="Description"><textarea name="description" defaultValue={item?.description ?? ""} maxLength={4000} /></Field>
          <div className="form-columns">
            {type === "task" ? (
              <>
                <Field label="Status">
                  <select name="status" defaultValue={item?.type === "task" ? item.status : "todo"}>
                    <option value="todo">To do</option>
                    <option value="done">Done</option>
                  </select>
                </Field>
                <Field label="Due date" hint="Optional">
                  <input name="dueDate" type="date" defaultValue={item?.type === "task" ? item.dueDate ?? "" : ""} />
                </Field>
              </>
            ) : (
              <Field label="Occurrence date">
                <input name="occurrenceDate" type="date" required defaultValue={item?.type === "event" ? item.occurrenceDate : ""} />
              </Field>
            )}
            <Field label="Estimated cost" hint={`Optional · ${currency}`}>
              <input name="estimatedCost" inputMode="decimal" placeholder="0.00" defaultValue={item?.estimatedCostMinor === null || item?.estimatedCostMinor === undefined ? "" : moneyInputValue(item.estimatedCostMinor, currency)} />
            </Field>
          </div>
          {item ? (
            <div className="money-summary-inline">
              <div><span>Estimated</span><strong>{item.estimatedCostMinor === null ? "Not set" : formatMoney(item.estimatedCostMinor, currency)}</strong></div>
              <div><span>Actual spend</span><strong>{formatMoney(item.actualSpendMinor, currency)}</strong></div>
              <div><span>Variance</span><strong className={(item.varianceMinor ?? 0) > 0 ? "money-over" : "money-under"}>{item.varianceMinor === null ? "—" : formatMoney(item.varianceMinor, currency)}</strong></div>
            </div>
          ) : null}
          <div className="item-form-actions">
            {item ? (
              <div className="item-secondary-actions">
                <button className="button button-danger" type="button" onClick={() => setConfirmDelete(true)}>Delete {type}</button>
                {item.type === "event" ? (
                  <button
                    className="button button-secondary"
                    type="button"
                    onClick={() => onStartFollowUp(item.id, item.collectionId)}
                  >
                    Create follow-up task
                  </button>
                ) : null}
              </div>
            ) : <span />}
            <div><button className="button button-secondary" type="button" onClick={onClose}>Cancel</button><button className="button button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : item ? "Save changes" : `Create ${type}`}</button></div>
          </div>
        </SubmitForm>
      ) : null}

      {tab === "files" && item ? (
        <section className="files-panel">
          <div
            className={`drop-zone ${dragActive ? "active" : ""}`}
            onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={onDrop}
          >
            <strong>Drop a file here</strong>
            <span>or choose from this device · up to 25 MB</span>
            <label className="button button-primary file-picker">Choose file<input type="file" onChange={(event) => void uploadItemFile(event.target.files?.[0])} /></label>
            {uploadProgress !== null ? (
              <div className="upload-progress" role="status" aria-live="polite">
                <progress max={100} value={uploadProgress} />
                <span>Uploading… {uploadProgress}%</span>
              </div>
            ) : null}
          </div>
          <div className="file-list">
            {pinnedFiles.map((file) => (
              <article key={file.id} className={file.pinned ? "pinned" : ""}>
                <span className="file-mark" aria-hidden="true">{file.pinned ? "◆" : "◇"}</span>
                <span className="row-title"><strong>{file.filename}</strong><small>{(file.sizeBytes / 1024).toFixed(file.sizeBytes > 1024 * 1024 ? 0 : 1)} KB · {file.contentType}</small></span>
                <div className="file-actions">
                  <a className="button button-secondary" href={`/api/files?id=${encodeURIComponent(file.fileObjectId)}`}>Download</a>
                  <button className="button button-secondary" type="button" onClick={() => onTogglePin(file.id, !file.pinned)}>{file.pinned ? "Unpin file" : "Pin file"}</button>
                  <button className="icon-button" type="button" aria-label={`Remove ${file.filename}`} onClick={() => { if (window.confirm(`Remove ${file.filename}?`)) void onDeleteFile(file.fileObjectId); }}>×</button>
                </div>
              </article>
            ))}
            {!pinnedFiles.length ? <EmptyState title="No files attached" description="Attach documents, images, archives, or other project material to this item." /> : null}
          </div>
        </section>
      ) : null}

      {tab === "relations" && item ? (
        <ItemRelationsPanel
          snapshot={snapshot}
          item={item}
          pending={pending}
          onMutate={onMutate}
          onOpenItem={onOpenItem}
          onError={setLocalError}
        />
      ) : null}

      {tab === "payments" && item ? (
        <section className="payments-panel">
          {uploadProgress !== null ? (
            <div className="upload-progress" role="status" aria-live="polite">
              <progress max={100} value={uploadProgress} />
              <span>Uploading receipt… {uploadProgress}%</span>
            </div>
          ) : null}
          <div className="money-summary-inline">
            <div><span>Estimated</span><strong>{item.estimatedCostMinor === null ? "Not set" : formatMoney(item.estimatedCostMinor, currency)}</strong></div>
            <div><span>Actual spend</span><strong>{formatMoney(item.actualSpendMinor, currency)}</strong></div>
            <div><span>Variance</span><strong className={(item.varianceMinor ?? 0) > 0 ? "money-over" : "money-under"}>{item.varianceMinor === null ? "—" : formatMoney(item.varianceMinor, currency)}</strong></div>
          </div>
          <div className="payment-history">
            <header><h3>Payment history</h3><span>{item.payments.length} entries</span></header>
            {item.payments.map((payment) => (
              <article key={payment.id}>
                <span className="payment-date">{payment.paidOn}</span>
                <span className="row-title"><strong>{payment.note || "Payment"}</strong><small>Added by {payment.createdByName}</small></span>
                <strong>{formatMoney(payment.amountMinor, currency)}</strong>
                <div className="payment-actions">
                  {payment.receiptFileId ? <a href={`/api/files?id=${encodeURIComponent(payment.receiptFileId)}`}>Receipt</a> : null}
                  {canManagePayment(payment) ? <button type="button" onClick={() => setEditingPayment(payment)}>Edit</button> : null}
                  {canManagePayment(payment) ? <button type="button" onClick={() => { if (window.confirm("Delete this payment?")) void onMutate({ action: "delete_payment", paymentId: payment.id }); }}>Delete</button> : null}
                </div>
                {canManagePayment(payment) ? (
                  <label className="receipt-picker">
                    {payment.receiptFileId ? "Replace receipt" : "Upload receipt"}
                    <input type="file" accept="image/*,application/pdf" capture="environment" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload({ paymentId: payment.id }, file); }} />
                  </label>
                ) : null}
              </article>
            ))}
            {!item.payments.length ? <EmptyState title="No payments recorded" description="Add each payment separately to build a reliable actual-spend history." /> : null}
          </div>
          <SubmitForm onSubmit={handlePayment} className="payment-form">
            <header><h3>{editingPayment ? "Edit payment" : "Add payment"}</h3>{editingPayment ? <button type="button" onClick={() => setEditingPayment(null)}>Cancel edit</button> : null}</header>
            <div className="form-columns">
              <Field label={`Amount (${currency})`}><input key={`amount-${editingPayment?.id ?? "new"}`} name="amount" inputMode="decimal" required defaultValue={editingPayment ? moneyInputValue(editingPayment.amountMinor, currency) : ""} placeholder="0.00" /></Field>
              <Field label="Payment date"><input key={`date-${editingPayment?.id ?? "new"}`} name="paidOn" type="date" required defaultValue={editingPayment?.paidOn ?? new Date().toISOString().slice(0, 10)} /></Field>
            </div>
            <Field label="Note" hint="Optional"><input key={`note-${editingPayment?.id ?? "new"}`} name="note" defaultValue={editingPayment?.note ?? ""} maxLength={500} placeholder="What was paid for?" /></Field>
            <button className="button button-primary" type="submit" disabled={pending}>{pending ? "Saving…" : editingPayment ? "Save payment" : "Add payment"}</button>
          </SubmitForm>
        </section>
      ) : null}

      <Modal open={confirmDelete} title={`Delete ${type}`} description="Files, payments, and receipts stored on this item will also be removed." onClose={() => setConfirmDelete(false)} size="small">
        <p className="confirmation-copy">Delete <strong>{item?.title}</strong>? This cannot be undone.</p>
        <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => setConfirmDelete(false)}>Cancel</button><button className="button button-danger" type="button" disabled={pending} onClick={async () => { if (!item) return; await onMutate({ action: "delete_item", itemId: item.id }); setConfirmDelete(false); onClose(); }}>Delete {type}</button></div>
      </Modal>
    </div>
  );
}
