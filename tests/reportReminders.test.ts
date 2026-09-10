import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getPendingReportViews } from "../src/bot/workflows/reportsWorkflow.js";
import { processDueReportReminders, type ReminderProcessorDependencies } from "../src/features/reportReminders/processDueReportReminders.js";
import { getFirstReminderDate, getSecondReminderDate } from "../src/features/reportReminders/reminderDates.js";
import type { ReminderRecord } from "../src/features/reportReminders/formatReportReminder.js";
import { isConfiguredTimeReached, loadReminderConfig } from "../src/features/reportReminders/reminderConfig.js";

const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("report reminder date logic", () => {
  it("moves a Monday promo end to Tuesday", () => expect(getFirstReminderDate(date("2026-08-10"))).toBe("2026-08-11"));
  it("moves a Friday promo end to Monday", () => expect(getFirstReminderDate(date("2026-08-14"))).toBe("2026-08-17"));
  it("moves a Saturday promo end to Monday", () => expect(getFirstReminderDate(date("2026-08-15"))).toBe("2026-08-17"));
  it("moves a Sunday promo end to Monday", () => expect(getFirstReminderDate(date("2026-08-16"))).toBe("2026-08-17"));
  it("moves a Monday first reminder plus five days to Monday", () => expect(getSecondReminderDate("2026-08-17")).toBe("2026-08-24"));
  it("moves a Tuesday first reminder plus five days to Monday", () => expect(getSecondReminderDate("2026-08-18")).toBe("2026-08-24"));
  it("keeps a weekday second reminder unchanged", () => expect(getSecondReminderDate("2026-08-20")).toBe("2026-08-25"));
  it("handles a month boundary", () => expect(getFirstReminderDate(date("2026-08-31"))).toBe("2026-09-01"));
  it("handles a year boundary", () => expect(getFirstReminderDate(date("2026-12-31"))).toBe("2027-01-01"));
  it("evaluates configured time in Europe/Berlin before DST", () => expect(isConfiguredTimeReached(new Date("2026-01-12T08:00:00Z"), { time: "09:00", timeZone: "Europe/Berlin" })).toBe(true));
  it("evaluates configured time in Europe/Berlin during DST", () => expect(isConfiguredTimeReached(new Date("2026-07-13T07:00:00Z"), { time: "09:00", timeZone: "Europe/Berlin" })).toBe(true));
  it("does not run before configured Berlin time", () => expect(isConfiguredTimeReached(new Date("2026-07-13T06:59:00Z"), { time: "09:00", timeZone: "Europe/Berlin" })).toBe(false));
  it("validates reminder configuration", () => {
    expect(loadReminderConfig({ REPORT_REMINDER_CHAT_ID: "123" })).toEqual({ chatId: "123", time: "09:00", timeZone: "Europe/Berlin" });
    expect(() => loadReminderConfig({ REPORT_REMINDER_CHAT_ID: "123", REPORT_REMINDER_TIME: "25:00" })).toThrow("HH:mm");
  });
});

const createdAt = date("2026-08-01");
function record(overrides: Partial<PromoPartner> = {}, partnerName = "Rozetka"): ReminderRecord {
  const promo: Promo = { id: `promo-${partnerName}`, lob: "ACCY", name: "August Case Promo", normalizedName: "august case promo", startDate: date("2026-08-10"), endDate: date("2026-08-16"), createdAt, updatedAt: createdAt };
  const partner: Partner = { id: `partner-${partnerName}`, name: partnerName, createdAt, updatedAt: createdAt };
  return { id: `relation-${partnerName}`, promoId: promo.id, partnerId: partner.id, rawEmailSubject: "August Case Promo - Rozetka", reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null, createdAt, updatedAt: createdAt, ...overrides, promo, partner };
}

function harness(records: ReminderRecord[]) {
  const send = vi.fn().mockResolvedValue(undefined);
  const markFirstSent = vi.fn(async (id: string, sentAt: Date) => { const found = records.find((item) => item.id === id); if (found) found.firstReminderSentAt = sentAt; });
  const markSecondSent = vi.fn(async (id: string, sentAt: Date) => { const found = records.find((item) => item.id === id); if (found) found.secondReminderSentAt = sentAt; });
  const dependencies: ReminderProcessorDependencies = { loadCandidates: async () => records, send, markFirstSent, markSecondSent, logError: vi.fn() };
  return { dependencies, send, markFirstSent, markSecondSent };
}

describe("report reminder processor", () => {
  it("sends a due first reminder for a pending report", async () => { const state = harness([record()]); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.send).toHaveBeenCalledOnce(); expect(state.send.mock.calls[0][0]).toContain("Rozetka"); });
  it("sends nothing when the report is received", async () => { const state = harness([record({ reportReceived: true, reportReceivedAt: date("2026-08-17") })]); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.send).not.toHaveBeenCalled(); });
  it("does not resend an already sent first reminder", async () => { const state = harness([record({ firstReminderSentAt: date("2026-08-17") })]); await processDueReportReminders(date("2026-08-18"), "Europe/Berlin", state.dependencies); expect(state.send).not.toHaveBeenCalled(); });
  it("sends the second reminder when due", async () => { const state = harness([record({ firstReminderSentAt: date("2026-08-17") })]); await processDueReportReminders(date("2026-08-24"), "Europe/Berlin", state.dependencies); expect(state.send).toHaveBeenCalledOnce(); expect(state.markSecondSent).toHaveBeenCalledOnce(); });
  it("does not resend an already sent second reminder", async () => { const state = harness([record({ firstReminderSentAt: date("2026-08-17"), secondReminderSentAt: date("2026-08-24") })]); await processDueReportReminders(date("2026-08-25"), "Europe/Berlin", state.dependencies); expect(state.send).not.toHaveBeenCalled(); });
  it("does not send a second reminder after receipt", async () => { const state = harness([record({ firstReminderSentAt: date("2026-08-17"), reportReceived: true, reportReceivedAt: date("2026-08-20") })]); await processDueReportReminders(date("2026-08-24"), "Europe/Berlin", state.dependencies); expect(state.send).not.toHaveBeenCalled(); });
  it("does not persist a timestamp when Telegram fails", async () => { const state = harness([record()]); state.dependencies.send = vi.fn().mockRejectedValue(new Error("Telegram unavailable")); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.markFirstSent).not.toHaveBeenCalled(); expect(state.dependencies.logError).toHaveBeenCalledOnce(); });
  it("persists the timestamp only after Telegram succeeds", async () => { const state = harness([record()]); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.send.mock.invocationCallOrder[0]).toBeLessThan(state.markFirstSent.mock.invocationCallOrder[0]); });
  it("continues after one reminder fails", async () => { const records = [record({}, "Rozetka"), record({}, "MOYO")]; const state = harness(records); state.dependencies.send = vi.fn().mockRejectedValueOnce(new Error("fail")).mockResolvedValueOnce(undefined); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.dependencies.send).toHaveBeenCalledTimes(2); expect(state.markFirstSent).toHaveBeenCalledWith("relation-MOYO", expect.any(Date)); });
  it("does not duplicate a reminder when run twice", async () => { const state = harness([record()]); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.send).toHaveBeenCalledOnce(); });
  it("processes only missing reports for multiple partners", async () => { const state = harness([record({ reportReceived: true }, "Rozetka"), record({}, "MOYO"), record({}, "Foxtrot")]); await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies); expect(state.send).toHaveBeenCalledTimes(2); expect(state.send.mock.calls.flat().join(" ")).not.toContain("Rozetka"); });
  it("never sends on a weekend", async () => { const state = harness([record()]); await processDueReportReminders(date("2026-08-22"), "Europe/Berlin", state.dependencies); expect(state.send).not.toHaveBeenCalled(); });
});

describe("manual reports", () => {
  it("returns formatted pending reports without modifying reminder state", async () => { const pending = record({ firstReminderSentAt: date("2026-08-17") }); const before = pending.firstReminderSentAt; const views = await getPendingReportViews(async () => [pending]); expect(views).toHaveLength(1); expect(views[0].text).toContain("Rozetka"); expect(pending.firstReminderSentAt).toBe(before); });
  it("returns an empty list when no reports are pending", async () => expect(getPendingReportViews(async () => [])).resolves.toEqual([]));
});
