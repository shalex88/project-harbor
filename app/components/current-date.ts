const currentDateFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  year: "numeric",
});

export function formatCurrentDate(date: Date): string {
  return currentDateFormatter.format(date);
}
