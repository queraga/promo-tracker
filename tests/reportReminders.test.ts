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
function record(overrides: Partial<PromoPartner> = {}, partnerName = "Rozetka", promoId = `promo-${partnerName}`): ReminderRecord {
  const promo: Promo = { id: promoId, lob: "ACCY", name: "August Case Promo", normalizedName: "august case promo", startDate: date("2026-08-10"), endDate: date("2026-08-16"), prolongedAt: null, createdAt, updatedAt: createdAt };
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
  it("groups three due first reminders for one Promo into one message and marks each relation after send", async () => {
    const records = [record({}, "Citrus", "promo-shared"), record({}, "Rozetka", "promo-shared"), record({}, "Comfy", "promo-shared")];
    const state = harness(records);
    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);
    expect(state.send).toHaveBeenCalledOnce();
    expect(state.send.mock.calls[0][0]).toContain("Partners: Citrus, Comfy, Rozetka");
    expect(state.markFirstSent.mock.calls.map(([id]) => id).sort()).toEqual(records.map(({ id }) => id).sort());
    expect(records.every(({ firstReminderSentAt }) => firstReminderSentAt?.getTime() === date("2026-08-17").getTime())).toBe(true);
    expect(state.send.mock.invocationCallOrder[0]).toBeLessThan(state.markFirstSent.mock.invocationCallOrder[0]);
  });
  it("lists only due pending partners when a received partner shares a Promo", async () => {
    const received = record({ reportReceived: true, reportReceivedAt: date("2026-08-17") }, "Citrus", "promo-shared");
    const records = [received, record({}, "Rozetka", "promo-shared"), record({}, "Comfy", "promo-shared")];
    const state = harness(records);
    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);
    expect(state.send).toHaveBeenCalledOnce();
    expect(state.send.mock.calls[0][0]).toContain("Partners: Comfy, Rozetka");
    expect(state.send.mock.calls[0][0]).not.toContain("Citrus");
    expect(state.markFirstSent).toHaveBeenCalledTimes(2);
    expect(received.firstReminderSentAt).toBeNull();
  });
  it("keeps separate Promos in separate messages", async () => {
    const records = [
      record({}, "Citrus", "promo-a"), record({}, "Rozetka", "promo-a"), record({}, "Comfy", "promo-a"),
      record({}, "ALLO", "promo-b"), record({}, "Foxtrot", "promo-b"),
    ];
    const state = harness(records);
    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);
    expect(state.send).toHaveBeenCalledTimes(2);
    const messages = state.send.mock.calls.map(([message]) => message);
    expect(messages.find((message) => message.includes("Partners: Citrus, Comfy, Rozetka"))).toBeDefined();
    expect(messages.find((message) => message.includes("Partners: ALLO, Foxtrot"))).toBeDefined();
    expect(messages.every((message) => !(message.includes("Citrus") && message.includes("ALLO")))).toBe(true);
  });
  it("sends different reminder stages for one Promo in separate messages", async () => {
    const records = [
      record({}, "Rozetka", "promo-shared"),
      record({ firstReminderSentAt: date("2026-08-17") }, "Comfy", "promo-shared"),
    ];
    const state = harness(records);
    await processDueReportReminders(date("2026-08-24"), "Europe/Berlin", state.dependencies);
    expect(state.send).toHaveBeenCalledTimes(2);
    expect(state.send.mock.calls.map(([message]) => message)).toEqual(expect.arrayContaining([
      expect.stringContaining("Partner: Rozetka"),
      expect.stringContaining("Partner: Comfy"),
    ]));
    expect(state.send.mock.calls.map(([message]) => message).find((message) => message.includes("Rozetka"))).toContain("Promo finished");
    expect(state.send.mock.calls.map(([message]) => message).find((message) => message.includes("Comfy"))).toContain("Promo report reminder");
    expect(state.markFirstSent).toHaveBeenCalledWith("relation-Rozetka", expect.any(Date));
    expect(state.markSecondSent).toHaveBeenCalledWith("relation-Comfy", expect.any(Date));
  });
  it("does not persist any grouped timestamp when Telegram send fails", async () => {
    const records = [record({}, "Citrus", "promo-shared"), record({}, "Rozetka", "promo-shared"), record({}, "Comfy", "promo-shared")];
    const state = harness(records);
    const failedSend = vi.fn().mockRejectedValue(new Error("Telegram unavailable"));
    state.dependencies.send = failedSend;
    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);
    expect(failedSend).toHaveBeenCalledOnce();
    expect(state.markFirstSent).not.toHaveBeenCalled();
    expect(state.markSecondSent).not.toHaveBeenCalled();
    expect(records.every(({ firstReminderSentAt }) => firstReminderSentAt === null)).toBe(true);
  });
  it("continues independent timestamp writes when one write fails after Telegram succeeds", async () => {
    const records = [record({}, "Citrus", "promo-shared"), record({}, "Rozetka", "promo-shared")];
    const state = harness(records);
    const markFirstSent = vi.fn(async (id: string, sentAt: Date) => {
      if (id === "relation-Citrus") throw new Error("SQLite write failed");
      const found = records.find((item) => item.id === id);
      if (found) found.firstReminderSentAt = sentAt;
    });
    state.dependencies.markFirstSent = markFirstSent;

    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);

    expect(state.send).toHaveBeenCalledOnce();
    expect(markFirstSent.mock.calls.map(([id]) => id)).toEqual(["relation-Citrus", "relation-Rozetka"]);
    expect(records.find(({ partner }) => partner.name === "Citrus")?.firstReminderSentAt).toBeNull();
    expect(records.find(({ partner }) => partner.name === "Rozetka")?.firstReminderSentAt).toEqual(date("2026-08-17"));
    expect(state.dependencies.logError).toHaveBeenCalledOnce();
  });
  it("uses singular Partner wording for one due relation", async () => {
    const state = harness([record({}, "Citrus", "promo-one")]);
    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);
    expect(state.send.mock.calls[0][0]).toContain("Partner: Citrus");
    expect(state.send.mock.calls[0][0]).not.toContain("Partners:");
  });
  it("sorts grouped partner names deterministically regardless of candidate order", async () => {
    const records = [record({}, "Rozetka", "promo-shared"), record({}, "Comfy", "promo-shared"), record({}, "Citrus", "promo-shared")];
    const state = harness(records);
    await processDueReportReminders(date("2026-08-17"), "Europe/Berlin", state.dependencies);
    expect(state.send.mock.calls[0][0]).toContain("Partners: Citrus, Comfy, Rozetka");
  });
  it("marks every grouped second reminder after the single send and preserves first timestamps", async () => {
    const firstSent = date("2026-08-17");
    const records = [record({ firstReminderSentAt: firstSent }, "Citrus", "promo-shared"), record({ firstReminderSentAt: firstSent }, "Comfy", "promo-shared"), record({ firstReminderSentAt: firstSent }, "Rozetka", "promo-shared")];
    const state = harness(records);
    await processDueReportReminders(date("2026-08-24"), "Europe/Berlin", state.dependencies);
    expect(state.send).toHaveBeenCalledOnce();
    expect(state.send.mock.calls[0][0]).toContain("Partners: Citrus, Comfy, Rozetka");
    expect(state.markSecondSent.mock.calls.map(([id]) => id).sort()).toEqual(records.map(({ id }) => id).sort());
    expect(records.every(({ secondReminderSentAt }) => secondReminderSentAt?.getTime() === date("2026-08-24").getTime())).toBe(true);
    expect(records.every(({ firstReminderSentAt }) => firstReminderSentAt?.getTime() === firstSent.getTime())).toBe(true);
    expect(state.send.mock.invocationCallOrder[0]).toBeLessThan(state.markSecondSent.mock.invocationCallOrder[0]);
  });
  it("excludes a report received after the first reminder from a grouped second reminder", async () => {
    const received = record({ firstReminderSentAt: date("2026-08-17"), reportReceived: true, reportReceivedAt: date("2026-08-20") }, "Citrus", "promo-shared");
    const state = harness([received, record({ firstReminderSentAt: date("2026-08-17") }, "Comfy", "promo-shared"), record({ firstReminderSentAt: date("2026-08-17") }, "Rozetka", "promo-shared")]);
    await processDueReportReminders(date("2026-08-24"), "Europe/Berlin", state.dependencies);
    expect(state.send).toHaveBeenCalledOnce();
    expect(state.send.mock.calls[0][0]).toContain("Partners: Comfy, Rozetka");
    expect(state.send.mock.calls[0][0]).not.toContain("Citrus");
    expect(state.markSecondSent).toHaveBeenCalledTimes(2);
    expect(received.secondReminderSentAt).toBeNull();
  });
  it("never sends on a weekend", async () => { const state = harness([record()]); await processDueReportReminders(date("2026-08-22"), "Europe/Berlin", state.dependencies); expect(state.send).not.toHaveBeenCalled(); });
});

describe("manual reports", () => {
  it("returns formatted pending reports without modifying reminder state", async () => { const pending = record({ firstReminderSentAt: date("2026-08-17") }); const before = pending.firstReminderSentAt; const views = await getPendingReportViews(async () => [pending]); expect(views).toHaveLength(1); expect(views[0].text).toContain("Rozetka"); expect(pending.firstReminderSentAt).toBe(before); });
  it("returns an empty list when no reports are pending", async () => expect(getPendingReportViews(async () => [])).resolves.toEqual([]));
});
