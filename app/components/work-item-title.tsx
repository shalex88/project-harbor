import type { ContactRecord, WorkItemRecord } from "@/lib/domain";
import { MentionText } from "./mention-text";

export function WorkItemTitle({
  item,
  contacts = [],
}: {
  item: Pick<WorkItemRecord, "title" | "files" | "contactMentions">;
  contacts?: ContactRecord[];
}) {
  return (
    <strong className="work-item-title">
      {item.files.length > 0 ? (
        <span
          className="attachment-indicator"
          role="img"
          aria-label="Has attached files"
        >
          <span aria-hidden="true">📎</span>
        </span>
      ) : null}
      <span className="work-item-title-text" dir="auto">
        <MentionText
          text={item.title}
          field="title"
          mentions={item.contactMentions}
          contacts={contacts}
        />
      </span>
    </strong>
  );
}
