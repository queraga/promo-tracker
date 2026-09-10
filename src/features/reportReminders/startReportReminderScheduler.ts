import type { ReminderConfig } from "./reminderConfig.js";
import { isConfiguredTimeReached } from "./reminderConfig.js";
import { getZonedCalendarDate, isWeekend } from "./reminderDates.js";

export function startReportReminderScheduler(config: ReminderConfig, process: (now: Date, timeZone: string) => Promise<void>, now: () => Date = () => new Date()) {
  const tick = async () => {
    const current = now();
    const date = getZonedCalendarDate(current, config.timeZone);
    if (isWeekend(date) || !isConfiguredTimeReached(current, config)) return;
    await process(current, config.timeZone);
  };
  void tick().catch((error) => console.error("Report reminder scheduler failed", error));
  const interval = setInterval(() => void tick().catch((error) => console.error("Report reminder scheduler failed", error)), 60_000);
  return () => clearInterval(interval);
}
