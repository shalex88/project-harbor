export type TimelineCalendarMode = "month" | "week";

const monthFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});
const monthDayFormatter = new Intl.DateTimeFormat("en", {
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});
const dayFormatter = new Intl.DateTimeFormat("en", {
  day: "numeric",
  timeZone: "UTC",
});

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00Z`);
}

function startOfWeek(anchor: string): Date {
  const date = utcDate(anchor);
  date.setUTCDate(date.getUTCDate() - date.getUTCDay());
  return date;
}

export function formatTimelinePeriod(
  anchor: string,
  mode: TimelineCalendarMode,
): string {
  const start =
    mode === "month"
      ? utcDate(`${anchor.slice(0, 7)}-01`)
      : startOfWeek(anchor);
  if (mode === "month") return monthFormatter.format(start);

  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const sameMonth =
    start.getUTCFullYear() === end.getUTCFullYear() &&
    start.getUTCMonth() === end.getUTCMonth();
  const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

  if (sameMonth) {
    return `${monthDayFormatter.format(start)}–${dayFormatter.format(end)}, ${end.getUTCFullYear()}`;
  }
  if (sameYear) {
    return `${monthDayFormatter.format(start)}–${monthDayFormatter.format(end)}, ${end.getUTCFullYear()}`;
  }
  return `${monthDayFormatter.format(start)}, ${start.getUTCFullYear()}–${monthDayFormatter.format(end)}, ${end.getUTCFullYear()}`;
}
