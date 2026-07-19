export function isPastAgendaDate(
  date: string,
  currentDate: string,
): boolean {
  return currentDate !== "" && date < currentDate;
}
