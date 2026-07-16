export type AgendaSortOrder = "desc" | "asc";

export function normalizeAgendaSortOrder(value: string): AgendaSortOrder {
  return value === "asc" ? "asc" : "desc";
}

export function sortAgendaEntries<T extends { date: string; title: string }>(
  entries: readonly T[],
  order: AgendaSortOrder,
): T[] {
  return [...entries].sort((left, right) => {
    const dateOrder =
      order === "desc"
        ? right.date.localeCompare(left.date)
        : left.date.localeCompare(right.date);
    return dateOrder || left.title.localeCompare(right.title);
  });
}
