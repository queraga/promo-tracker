import { formatReportReminder, type ReminderRecord, type ReminderType } from "./formatReportReminder.js";
import { getFirstReminderDate, getSecondReminderDate, getZonedCalendarDate, isWeekend } from "./reminderDates.js";
import { getReportReminderCandidates, markFirstReminderSent, markSecondReminderSent } from "./reminderRepository.js";

export type ReminderProcessorDependencies = {
  loadCandidates: () => Promise<ReminderRecord[]>;
  send: (message: string) => Promise<void>;
  markFirstSent: (id: string, sentAt: Date) => Promise<unknown>;
  markSecondSent: (id: string, sentAt: Date) => Promise<unknown>;
  logError: (message: string, error: unknown) => void;
};

const defaults = { loadCandidates: getReportReminderCandidates, markFirstSent: markFirstReminderSent, markSecondSent: markSecondReminderSent, logError: (message: string, error: unknown) => console.error(message, error) };

export async function processDueReportReminders(now: Date, timeZone: string, dependencies: ReminderProcessorDependencies): Promise<void> {
  const today = getZonedCalendarDate(now, timeZone);
  if (isWeekend(today)) return;
  const candidates = await dependencies.loadCandidates();
  for (const record of candidates) {
    if (record.reportReceived) continue;
    const firstDate = getFirstReminderDate(record.promo.endDate);
    const secondDate = getSecondReminderDate(firstDate);
    let type: ReminderType | null = null;
    if (!record.firstReminderSentAt && today >= firstDate) type = "first";
    else if (record.firstReminderSentAt && !record.secondReminderSentAt && today >= secondDate) type = "second";
    if (!type) continue;
    try {
      await dependencies.send(formatReportReminder(record, type));
      if (type === "first") await dependencies.markFirstSent(record.id, now);
      else await dependencies.markSecondSent(record.id, now);
    } catch (error) {
      dependencies.logError(`Report reminder failed: promoPartner=${record.id} promo=${record.promoId} partner=${record.partner.name} type=${type}`, error);
    }
  }
}

export function createReminderProcessor(send: (message: string) => Promise<void>): ReminderProcessorDependencies {
  return { ...defaults, send };
}
