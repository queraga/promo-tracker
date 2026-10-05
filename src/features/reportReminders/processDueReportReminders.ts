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
  const groups = new Map<string, { type: ReminderType; records: ReminderRecord[] }>();
  for (const record of candidates) {
    if (record.reportReceived) continue;
    const firstDate = getFirstReminderDate(record.promo.endDate);
    const secondDate = getSecondReminderDate(firstDate);
    let type: ReminderType | null = null;
    if (!record.firstReminderSentAt && today >= firstDate) type = "first";
    else if (record.firstReminderSentAt && !record.secondReminderSentAt && today >= secondDate) type = "second";
    if (!type) continue;

    const key = `${record.promoId}:${type}`;
    const group = groups.get(key);
    if (group) group.records.push(record);
    else groups.set(key, { type, records: [record] });
  }

  for (const { type, records } of groups.values()) {
    const [record] = records;
    if (!record) continue;
    const dueRecords = [...records].sort((left, right) =>
      left.partner.name.localeCompare(right.partner.name, "en") || left.partner.id.localeCompare(right.partner.id, "en"));
    const partnerNames = dueRecords.map(({ partner }) => partner.name);
    try {
      await dependencies.send(formatReportReminder(record, type, partnerNames));
    } catch (error) {
      dependencies.logError(`Report reminder failed: promo=${record.promoId} partners=${partnerNames.join(", ")} type=${type}`, error);
      continue;
    }

    for (const dueRecord of dueRecords) {
      try {
        if (type === "first") await dependencies.markFirstSent(dueRecord.id, now);
        else await dependencies.markSecondSent(dueRecord.id, now);
      } catch (error) {
        dependencies.logError(`Report reminder timestamp failed: promoPartner=${dueRecord.id} promo=${dueRecord.promoId} partner=${dueRecord.partner.name} type=${type}`, error);
      }
    }
  }
}

export function createReminderProcessor(send: (message: string) => Promise<void>): ReminderProcessorDependencies {
  return { ...defaults, send };
}
