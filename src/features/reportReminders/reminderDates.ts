const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function toCalendarDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addCalendarDays(calendarDate: string, days: number): string {
  const match = CALENDAR_DATE.exec(calendarDate);
  if (!match) throw new Error(`Invalid calendar date: ${calendarDate}`);
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  return toCalendarDate(date);
}

export function moveWeekendToMonday(calendarDate: string): string {
  const day = new Date(`${calendarDate}T00:00:00.000Z`).getUTCDay();
  if (day === 6) return addCalendarDays(calendarDate, 2);
  if (day === 0) return addCalendarDays(calendarDate, 1);
  return calendarDate;
}

export function getFirstReminderDate(endDate: Date): string {
  return moveWeekendToMonday(addCalendarDays(toCalendarDate(endDate), 1));
}

export function getSecondReminderDate(firstReminderDate: string): string {
  return moveWeekendToMonday(addCalendarDays(firstReminderDate, 5));
}

export function getZonedCalendarDate(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

export function isWeekend(calendarDate: string): boolean {
  const day = new Date(`${calendarDate}T00:00:00.000Z`).getUTCDay();
  return day === 0 || day === 6;
}
