import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { createBot, HELP_TEXT } from "../src/bot/createBot.js";
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
import type { CreatePromoOperationResult } from "../src/features/createPromo/createPromo.types.js";
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
    isFsm: false,
    credit: null,
    allLob: false,
    classificationConflict: null,
    partner: "Rozetka",
    partnerCandidates: ["Rozetka"],
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
    endDate: new Date(`${end}T00:00:00.000Z`), prolongedAt: null, createdAt, updatedAt: createdAt,
  };
  const partner: Partner = { id: "partner-1", name: "Rozetka & Co", createdAt, updatedAt: createdAt };
  const promoPartner: PromoPartner = {
    id: "relation-1", promoId: promo.id, partnerId: partner.id, rawEmailSubject: subject,
    reportReceived: false, reportReceivedAt: null, createdAt, updatedAt: createdAt,
    firstReminderSentAt: null, secondReminderSentAt: null,
  };
  return { promo, partner, promoPartner };
}

function createResult(): CreatePromoOperationResult {
  return { promos: [{ ...records(), createdPromo: true, createdPartner: true, createdPromoPartner: true, isFsm: false, credit: null }], allLob: false, credit: null };
}

describe("Telegram bot workflows", () => {
  it("previews a valid subject without persisting before confirmation", () => {
    const persist = vi.fn();
    const result = handlePromoSubject(subject, identity, makeStore(), currentDate);
    expect(result.kind).toBe("preview");
    expect(result.kind === "preview" && result.text).toContain("Промо розпізнано");
    expect(persist).not.toHaveBeenCalled();
  });

  it("previews valid FSM details and its human-readable name", () => {
    const result = handlePromoSubject("FSM Comfy iPhone 07.10-20.10", identity, makeStore(), currentDate);
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.text).toContain("FSM промо розпізнано");
    expect(result.text).toContain("Тип: FSM");
    expect(result.text).toContain("Partner: Comfy ✓");
    expect(result.text).toContain("LOB: iPhone ✓");
    expect(result.text).toContain("07.10.2026 - 20.10.2026 ✓");
    expect(result.text).toContain("Промо:\n");
    expect(result.text).toContain("FSM iPhone");
  });

  it("previews Privat bank, mechanic, composite LOB, partner, and period", () => {
    const result = handlePromoSubject("Re: ОЧ25 Приват Нова лінійка AirPods & Apple Watch 28.09-04.10 - Rozetka", identity, makeStore(), currentDate);
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.text).toContain("Bank: ПриватБанк");
    expect(result.text).toContain("Mechanic: ОЧ25");
    expect(result.text).toContain("LOB: AW &amp; AirPods ✓");
    expect(result.text).toContain("Partner: Rozetka ✓");
  });

  it("previews a multi-partner credit promo once with one confirmation", () => {
    const store = makeStore();
    const result = handlePromoSubject(
      "ОЧ15 Приват iPhone initiative\n- ОЧ15 ПриватБанк\n- Partners: Rozetka, Kibernetiki, iSpace\n- 01.10-31.12",
      identity, store, currentDate,
    );
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.confirmationId).toBe("confirmation-1");
    expect(result.text).toContain("Кредитне промо розпізнано");
    expect(result.text).toContain("Partners: Rozetka, Kibernetiki, iSpace ✓");
    expect(result.text).toContain("Промо:\nОЧ15 Приват iPhone initiative");
  });

  it("previews all inline credit partners with the corrected title and one Add action", () => {
    const result = handlePromoSubject(
      "Комерційні умови Mac, iPad - FYQ4'26 ОЧ18 01.10-31.12 - Kibernetiki iSpace KTC Comfy foxtrot epicentr citrus rozetka",
      identity,
      makeStore(),
      currentDate,
    );
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.text).toContain("Bank: ПриватБанк");
    expect(result.text).toContain("Mechanic: ОЧ18");
    expect(result.text).toContain("LOB: Mac iPad ✓");
    expect(result.text).toContain("Partners: Kibernetiki, iSpace, KTC, Comfy, Foxtrot, Epicentr, Citrus, Rozetka ✓");
    expect(result.text).toContain("Period: 01.10.2026 - 31.12.2026 ✓");
    expect(result.text).toContain("Промо:\nКомерційні умови Mac, iPad - FYQ4'26 ОЧ18 01.10-31.12");
    expect(result.confirmationId).toBe("confirmation-1");
  });

  it("does not offer Add for an incomplete credit partner list", () => {
    const result = handlePromoSubject(
      "ОЧ15 Приват iPhone initiative\n- ОЧ15 ПриватБанк\n- Rozetka Kibernetiki UnknownPartner\n- 01.10-31.12",
      identity, makeStore(), currentDate,
    );
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.text).toContain("Partners: Rozetka, Kibernetiki");
    expect("confirmationId" in result).toBe(false);
  });

  it("previews all-LOB credit once with one confirmation id and six atomic LOBs", () => {
    const store = makeStore();
    const result = handlePromoSubject("ПЧ10 mono Apple all LOB 01.10-30.10 - Foxtrot", identity, store, currentDate);
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.confirmationId).toBe("confirmation-1");
    expect(result.text).toContain("Bank: mono");
    expect(result.text).toContain("Mechanic: ПЧ10");
    expect(result.text).toContain("Буде створено: 6 промо");
    expect(result.text).toContain("iPhone, Mac, iPad, AW, AirPods, ACCY");
    expect(result.text.match(/Буде створено: 6 промо/g)).toHaveLength(1);
  });

  it("previews mono brand-only credit without a mechanic", () => {
    const result = handlePromoSubject("monomarket iPhone 01.10-30.10 - Foxtrot", identity, makeStore(), currentDate);
    expect(result.kind).toBe("preview");
    if (result.kind !== "preview") return;
    expect(result.text).toContain("Bank: mono");
    expect(result.text).not.toContain("Mechanic:");
  });

  it.each([
    ["FSM iPhone 07.10-20.10", "Не вдалося визначити партнера для FSM промо. Додайте одного партнера."],
    ["FSM Comfy iPhone 07.10-20.10 Rozetka", "FSM промо має бути прив'язане до одного партнера. Вкажіть одного партнера."],
  ])("rejects invalid FSM partner cardinality without an Add confirmation: %s", (input, guidance) => {
    const result = handlePromoSubject(input, identity, makeStore(), currentDate);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.text).toContain(guidance);
    expect("confirmationId" in result).toBe(false);
  });

  it.each([
    ["FSM ПЧ10 mono iPhone 01.10-30.10 - Comfy", "FSM і кредитні маркери не можна поєднувати"],
    ["ОЧ25 ПЧ10 mono iPhone 01.10-30.10 - Comfy", "Вкажіть одну кредитну механіку та один банк"],
    ["ПЧ10 mono iPhone 01.10-30.10", "Не вдалося визначити партнера"],
    ["ПЧ10 mono iPhone - Foxtrot", "Не вдалося визначити період"],
    ["ПЧ10 mono Apple 01.10-30.10 - Foxtrot", "Не вдалося визначити LOB"],
  ])("rejects invalid credit input without a confirmation action: %s", (input, guidance) => {
    const result = handlePromoSubject(input, identity, makeStore(), currentDate);
    expect(result.kind).toBe("invalid");
    if (result.kind !== "invalid") return;
    expect(result.text).toContain(guidance);
    expect("confirmationId" in result).toBe(false);
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

  it("passes all selected partners through the Telegram Add callback", async () => {
    const store = makeStore();
    const preview = handlePromoSubject(
      "ОЧ18 Приват iPhone promo 01.10-31.12 - Kibernetiki iSpace KTC",
      identity,
      store,
      currentDate,
    );
    expect(preview.kind).toBe("preview");
    if (preview.kind !== "preview") return;
    const persist = vi.fn().mockResolvedValue(createResult());

    const result = await handlePromoCallback("add", preview.confirmationId, identity, store, persist);

    expect(result.kind).toBe("added");
    expect(persist).toHaveBeenCalledWith(expect.objectContaining({
      selectedPartners: ["Kibernetiki", "iSpace", "KTC"],
    }));
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

  it("confirms FSM creation for the specific partner", () => {
    const result = formatPromoResult({ ...createResult(), promos: [{ ...createResult().promos[0]!, promo: { ...records().promo, name: "FSM iPhone", normalizedName: "!fsm:Comfy:fsm iphone" }, partner: { ...records().partner, name: "Comfy" }, isFsm: true }] });
    expect(result).toContain("FSM промо додано");
    expect(result).toContain("Тип: FSM");
    expect(result).toContain("Partner: Comfy");
    expect(result).toContain("Промо: FSM iPhone");
  });

  it("returns one concise all-LOB success result", () => {
    const records = createResult().promos[0]!;
    const result = formatPromoResult({
      credit: { bank: "MONO", mechanic: "ПЧ10" }, allLob: true,
      promos: ["iPhone", "Mac", "iPad", "AW", "AirPods", "ACCY"].map((lob) => ({ ...records, promo: { ...records.promo, lob } })),
    });
    expect(result).toContain("Кредитне промо додано");
    expect(result).toContain("mono · ПЧ10");
    expect(result).toContain("6 LOB: iPhone, Mac, iPad, AW, AirPods, ACCY");
    expect(result.match(/Кредитне промо додано/g)).toHaveLength(1);
  });

  it("shows unique partners and unique LOBs for a multi-partner all-LOB result", () => {
    const base = createResult().promos[0]!;
    const partners = ["Rozetka", "Kibernetiki", "iSpace"];
    const lobs = ["iPhone", "Mac", "iPad", "AW", "AirPods", "ACCY"];
    const result = formatPromoResult({
      credit: { bank: "PRIVATBANK", mechanic: "ОЧ15" }, allLob: true,
      promos: lobs.flatMap((lob) => partners.map((name) => ({
        ...base,
        promo: { ...base.promo, lob },
        partner: { ...base.partner, name },
        createdPromoPartner: true,
      }))),
    });
    expect(result).toContain("Partners: Rozetka, Kibernetiki, iSpace");
    expect(result).toContain("6 LOB: iPhone, Mac, iPad, AW, AirPods, ACCY");
    expect(result.match(/iPhone/g)).toHaveLength(1);
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

  it("explains that promo data can be sent as a subject or text", () => {
    expect(HELP_TEXT).toBe(`Як додати промо:

1. Надішліть subject промо-листа або текст з даними промо.
2. Бот визначить LOB, партнера та період.
3. Перевірте розпізнані дані.
4. Натисніть Add для збереження.

Якщо щось не розпізнано, додайте відсутні дані та надішліть повідомлення ще раз.

Commands:
/active
/reports
/help`);
  });

  it("fails fast with a clear error when the token is missing", () => {
    expect(() => createBot("")).toThrow("TELEGRAM_BOT_TOKEN is required");
  });
});
