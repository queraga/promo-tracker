import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createBot } from "../src/bot/createBot.js";
import { formatActivePromos } from "../src/bot/formatters/formatActivePromos.js";
import { formatPromoPreview } from "../src/bot/formatters/formatPromoPreview.js";
import { formatPromoResult } from "../src/bot/formatters/formatPromoResult.js";
import { splitMessage } from "../src/bot/formatters/splitMessage.js";
import { PendingPromoStore } from "../src/bot/state/pendingPromoStore.js";
import { getActivePromoView } from "../src/bot/workflows/activeWorkflow.js";
import { handlePromoCallback } from "../src/bot/workflows/promoCallbackWorkflow.js";
import { handlePromoSubject } from "../src/bot/workflows/promoSubjectWorkflow.js";
import { handleReportReceived } from "../src/bot/workflows/reportCallbackWorkflow.js";
import { getPendingReportViews } from "../src/bot/workflows/reportsWorkflow.js";
import type { CreatePromoResult } from "../src/features/createPromo/createPromo.types.js";
import type { ParsedPromoSubject } from "../src/features/parsePromoSubject/parsePromoSubject.types.js";

const identity = { chatId: 10, userId: 20 };
const currentDate = new Date("2026-09-09T10:00:00.000Z");
const subject = "Promo iPhone 17 Pro 07.09-13.09 - Rozetka";

function makeStore(now: () => number = () => 0) {
  return new PendingPromoStore(10 * 60 * 1000, now, () => "confirmation-1");
}

function makeParsed(): ParsedPromoSubject {
  return {
    rawSubject: subject,
    partner: "Rozetka",
    lob: "iPhone",
    promoName: "Promo iPhone 17 Pro",
    startDate: "2026-09-07",
    endDate: "2026-09-13",
    normalizedName: "promo iphone 17 pro",
    isValid: true,
    warnings: [],
  };
}

function records(start = "2026-09-07", end = "2026-09-13") {
  const createdAt = new Date("2026-09-01T00:00:00.000Z");
  const promo: Promo = {
    id: "promo-1", lob: "iPhone", name: "Promo <iPhone>",
    normalizedName: "promo iphone", startDate: new Date(`${start}T00:00:00.000Z`),
    endDate: new Date(`${end}T00:00:00.000Z`), createdAt, updatedAt: createdAt,
  };
  const partner: Partner = { id: "partner-1", name: "Rozetka & Co", createdAt, updatedAt: createdAt };
  const promoPartner: PromoPartner = {
    id: "relation-1", promoId: promo.id, partnerId: partner.id, rawEmailSubject: subject,
    reportReceived: false, reportReceivedAt: null, createdAt, updatedAt: createdAt,
    firstReminderSentAt: null, secondReminderSentAt: null,
  };
  return { promo, partner, promoPartner };
}

function createResult(): CreatePromoResult {
  return { ...records(), createdPromo: true, createdPartner: true, createdPromoPartner: true };
}

describe("Telegram bot workflows", () => {
  it("previews a valid subject without persisting before confirmation", () => {
    const persist = vi.fn();
    const result = handlePromoSubject(subject, identity, makeStore(), currentDate);
    expect(result.kind).toBe("preview");
    expect(result.kind === "preview" && result.text).toContain("Промо розпізнано");
    expect(persist).not.toHaveBeenCalled();
  });

  it("shows warnings for invalid input without an Add confirmation", () => {
    const result = handlePromoSubject("Unknown promo", identity, makeStore(), currentDate);
    expect(result.kind).toBe("invalid");
    expect(result.kind === "invalid" && result.text).toContain("Не вдалося повністю розпізнати промо");
    expect("confirmationId" in result).toBe(false);
  });

  it("removes the pending confirmation after successful persistence", async () => {
    const store = makeStore();
    const id = store.createPendingPromo(makeParsed(), identity);
    const persist = vi.fn().mockResolvedValue(createResult());
    expect((await handlePromoCallback("add", id, identity, store, persist)).kind).toBe("added");
    expect(persist).toHaveBeenCalledTimes(1);
    expect(store.getPendingPromo(id, identity).status).toBe("missing");
  });

  it("keeps a pending confirmation when persistence fails and allows retry", async () => {
    const store = makeStore();
    const id = store.createPendingPromo(makeParsed(), identity);
    const persist = vi.fn()
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValueOnce(createResult());

    await expect(handlePromoCallback("add", id, identity, store, persist))
      .rejects.toThrow("database unavailable");
    expect(store.getPendingPromo(id, identity).status).toBe("found");

    expect((await handlePromoCallback("add", id, identity, store, persist)).kind).toBe("added");
    expect(persist).toHaveBeenCalledTimes(2);
    expect(store.getPendingPromo(id, identity).status).toBe("missing");
  });

  it("cancels without persisting", async () => {
    const store = makeStore();
    const id = store.createPendingPromo(makeParsed(), identity);
    const persist = vi.fn();
    expect((await handlePromoCallback("cancel", id, identity, store, persist)).kind).toBe("cancelled");
    expect(persist).not.toHaveBeenCalled();
    expect(store.getPendingPromo(id, identity).status).toBe("missing");
  });

  it("rejects an expired confirmation without persisting", async () => {
    let now = 0;
    const store = makeStore(() => now);
    const id = store.createPendingPromo(makeParsed(), identity);
    now = 10 * 60 * 1000;
    const persist = vi.fn();
    expect((await handlePromoCallback("add", id, identity, store, persist)).kind).toBe("expired");
    expect(persist).not.toHaveBeenCalled();
  });

  it("rejects a confirmation from another user without consuming it", async () => {
    const store = makeStore();
    const id = store.createPendingPromo(makeParsed(), identity);
    const persist = vi.fn().mockResolvedValue(createResult());
    expect((await handlePromoCallback("add", id, { ...identity, userId: 99 }, store, persist)).kind).toBe("forbidden");
    expect(persist).not.toHaveBeenCalled();
    expect(store.getPendingPromo(id, identity).status).toBe("found");
  });

  it("handles a repeated Add without a second persistence call", async () => {
    const store = makeStore();
    const id = store.createPendingPromo(makeParsed(), identity);
    const persist = vi.fn().mockResolvedValue(createResult());
    await handlePromoCallback("add", id, identity, store, persist);
    expect((await handlePromoCallback("add", id, identity, store, persist)).kind).toBe("missing");
    expect(persist).toHaveBeenCalledTimes(1);
  });

  it("shows only active promos", async () => {
    const active = records("2026-09-07", "2026-09-13");
    const finished = records("2026-08-01", "2026-08-05");
    finished.promo.id = "promo-2";
    const text = await getActivePromoView(
      async () => [
        { ...active.promo, partners: [{ ...active.promoPartner, partner: active.partner }] },
        { ...finished.promo, partners: [{ ...finished.promoPartner, partner: finished.partner }] },
      ],
      currentDate,
    );
    expect(text).toContain("07.09-13.09");
    expect(text).not.toContain("01.08-05.08");
  });

  it("returns the active-promos empty state", async () => {
    expect(await getActivePromoView(async () => [], currentDate)).toBe("Немає активних промо.");
  });

  it("builds report views from the pending-report query", async () => {
    const record = records("2026-08-01", "2026-08-05");
    const load = vi.fn().mockResolvedValue([{ ...record.promoPartner, promo: record.promo, partner: record.partner }]);
    const views = await getPendingReportViews(load);
    expect(load).toHaveBeenCalledOnce();
    expect(views[0]).toMatchObject({ promoPartnerId: "relation-1" });
    expect(views[0].text).toContain("Rozetka &amp; Co");
  });

  it("marks a pending report received", async () => {
    const record = records().promoPartner;
    const mark = vi.fn().mockResolvedValue({ ...record, reportReceived: true });
    expect(await handleReportReceived(record.id, async () => record, mark)).toBe("marked");
    expect(mark).toHaveBeenCalledWith(record.id);
  });

  it("handles an already received report without writing", async () => {
    const record = { ...records().promoPartner, reportReceived: true };
    const mark = vi.fn();
    expect(await handleReportReceived(record.id, async () => record, mark)).toBe("already-received");
    expect(mark).not.toHaveBeenCalled();
  });

  it("escapes user-controlled HTML", () => {
    const text = formatPromoPreview({ ...makeParsed(), promoName: "Promo <iPhone> & AirPods" });
    expect(text).toContain("Promo &lt;iPhone&gt; &amp; AirPods");
    expect(text).not.toContain("Promo <iPhone>");
  });

  it("gives focused guidance when only the period is missing", () => {
    const text = formatPromoPreview({ ...makeParsed(), lob: "AW & AirPods", startDate: null, endDate: null, isValid: false, warnings: ["Promo period could not be detected"] });
    expect(text).toContain("LOB: AW &amp; AirPods ✓"); expect(text).toContain("Partner: Rozetka ✓"); expect(text).toContain("Period: не знайдено"); expect(text).toContain("Не вдалося визначити період"); expect(text).not.toContain("Не вдалося визначити партнера");
  });

  it("marks every recognized field in a successful preview", () => {
    const text = formatPromoPreview({ ...makeParsed(), lob: "AW & AirPods" });
    expect(text).toContain("LOB: AW &amp; AirPods ✓");
    expect(text).toContain("Partner: Rozetka ✓");
    expect(text).toContain("Period: 07.09.2026 - 13.09.2026 ✓");
  });

  it("gives focused guidance when only the partner is missing", () => {
    const text = formatPromoPreview({ ...makeParsed(), partner: null, isValid: false, warnings: ["Partner could not be detected"] });
    expect(text).toContain("Partner: не знайдено"); expect(text).toContain("Не вдалося визначити партнера"); expect(text).not.toContain("Не вдалося визначити період");
  });

  it("gives focused guidance when only the LOB is missing", () => {
    const text = formatPromoPreview({ ...makeParsed(), lob: null, isValid: false, warnings: ["LOB could not be detected"] });
    expect(text).toContain("LOB: не знайдено"); expect(text).toContain("Не вдалося визначити LOB"); expect(text).not.toContain("Не вдалося визначити період");
  });

  it("lists every missing semantic field without parser internals", () => {
    const text = formatPromoPreview({ ...makeParsed(), lob: null, partner: null, startDate: null, endDate: null, isValid: false, warnings: ["internal warning"] });
    expect(text).toContain("Не вдалося визначити LOB"); expect(text).toContain("Не вдалося визначити партнера"); expect(text).toContain("Не вдалося визначити період"); expect(text).not.toContain("internal warning");
  });

  it("confirms successful persistence with recognized fields", () => {
    const text = formatPromoResult(createResult());
    expect(text).toContain("Промо додано"); expect(text).toContain("LOB:"); expect(text).toContain("Partner:"); expect(text).toContain("Period:");
  });

  it("splits very long active-promo HTML into independently valid chunks", () => {
    const record = records();
    record.promo.name = "<very long & escaped promo> ".repeat(20);
    const output = formatActivePromos([
      { ...record.promo, partners: [{ ...record.promoPartner, partner: record.partner }] },
    ]);
    const chunks = splitMessage(output, 120);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(120);
      expect(chunk.match(/&/g)?.length ?? 0).toBe(chunk.match(/&(?:#\d+|#x[\da-f]+|[a-z][\w]+);/gi)?.length ?? 0);
      const tags = chunk.match(/<\/?[a-z][^>]*>/gi) ?? [];
      const stack: string[] = [];
      for (const tag of tags) {
        const closing = tag.match(/^<\/([a-z][\w-]*)/i);
        const opening = tag.match(/^<([a-z][\w-]*)/i);
        if (closing) expect(stack.pop()).toBe(closing[1].toLowerCase());
        else if (opening && !tag.endsWith("/>")) stack.push(opening[1].toLowerCase());
      }
      expect(stack).toEqual([]);
      expect(chunk).not.toMatch(/<[^>]*$/);
      expect(chunk).not.toMatch(/&[^;]*$/);
    }
  });

  it("cleans expired pending promos lazily", () => {
    let now = 0;
    const store = makeStore(() => now);
    const id = store.createPendingPromo(makeParsed(), identity);
    now = 10 * 60 * 1000;
    store.cleanupExpiredPromos();
    expect(store.getPendingPromo(id, identity).status).toBe("missing");
  });

  it("does not treat Telegram commands as promo subjects", () => {
    expect(handlePromoSubject("/active", identity, makeStore(), currentDate)).toEqual({ kind: "ignored" });
  });

  it("fails fast with a clear error when the token is missing", () => {
    expect(() => createBot("")).toThrow("TELEGRAM_BOT_TOKEN is required");
  });
});
