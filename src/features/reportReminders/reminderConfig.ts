export type ReminderConfig = { chatId: string; time: string; timeZone: string };
const TIME = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function loadReminderConfig(environment: NodeJS.ProcessEnv = process.env): ReminderConfig {
  const chatId = environment.REPORT_REMINDER_CHAT_ID?.trim();
  if (!chatId) throw new Error("REPORT_REMINDER_CHAT_ID is required to start report reminders");
  const time = environment.REPORT_REMINDER_TIME?.trim() || "09:00";
  if (!TIME.test(time)) throw new Error("REPORT_REMINDER_TIME must use HH:mm format");
  const timeZone = environment.REPORT_REMINDER_TIMEZONE?.trim() || "Europe/Berlin";
  try { new Intl.DateTimeFormat("en", { timeZone }).format(); } catch { throw new Error(`Invalid REPORT_REMINDER_TIMEZONE: ${timeZone}`); }
  return { chatId, time, timeZone };
}

export function isConfiguredTimeReached(now: Date, config: Pick<ReminderConfig, "time" | "timeZone">): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: config.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return `${hour}:${minute}` >= config.time;
}
