import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";

export type PromoStatus = "planned" | "active" | "finished";

export function getPromoStatus(
  startDate: Date,
  endDate: Date,
  currentDate: Date = new Date(),
): PromoStatus {
  const currentCalendarDate = toUtcCalendarDate(currentDate);

  if (currentCalendarDate < startDate) return "planned";
  if (currentCalendarDate > endDate) return "finished";
  return "active";
}
