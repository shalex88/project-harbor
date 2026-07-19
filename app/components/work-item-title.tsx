import type { WorkItemRecord } from "@/lib/domain";

export function WorkItemTitle({
  item,
}: {
  item: Pick<WorkItemRecord, "title" | "files">;
}) {
  return (
    <strong className="work-item-title">
      {item.files.length > 0 ? (
        <span className="attachment-indicator">
          <span className="sr-only">Has attached files</span>
          <span aria-hidden="true">📎</span>
        </span>
      ) : null}
      <span className="work-item-title-text" dir="auto">
        {item.title}
      </span>
    </strong>
  );
}
