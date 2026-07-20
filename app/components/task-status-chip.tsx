import type { TaskRecord } from "@/lib/domain";

export function TaskStatusChip({
  status,
  compact = false,
}: {
  status: TaskRecord["status"];
  compact?: boolean;
}) {
  return (
    <span
      className={`status-chip status-${status}${compact ? " status-chip-compact" : ""}`}
    >
      {status === "done" ? "Done" : "To do"}
    </span>
  );
}
