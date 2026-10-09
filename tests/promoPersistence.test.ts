import { beforeEach, describe, expect, it } from "vitest";
import { createPromoFromParsedSubject, createPromoOperationFromParsedSubject } from "../src/features/createPromo/createPromoFromParsedSubject.js";
import { InvalidParsedPromoSubjectError } from "../src/features/createPromo/createPromo.types.js";
import { ClosedReportingPeriodError } from "../src/features/quarterlyReporting/closedPeriods.js";
import { parsePromoSubject } from "../src/features/parsePromoSubject/parsePromoSubject.js";
import { getAllPromos } from "../src/features/promoQueries/getAllPromos.js";
import { getPendingReports } from "../src/features/promoQueries/getPendingReports.js";
import { getPromoById } from "../src/features/promoQueries/getPromoById.js";
import { markReportPending } from "../src/features/report/markReportPending.js";
import { markReportReceived } from "../src/features/report/markReportReceived.js";
import { prisma } from "../src/shared/db/prisma.js";

const now = new Date("2026-09-09T10:00:00.000Z");
const iphoneRozetka = "Promo iPhone 17 Pro 07.09-13.09 - Rozetka";

function parsed(subject: string) {
  return parsePromoSubject(subject, now);
}

beforeEach(async () => {
  await prisma.reportingPeriod.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

describe("promo persistence", () => {
  it("persists an inline multi-partner credit promo as one Promo with all partner relations idempotently", async () => {
    const input = "Комерційні умови Mac, iPad - FYQ4'26 ОЧ18 01.10-31.12 - Kibernetiki iSpace KTC Comfy foxtrot epicentr citrus rozetka";
    const parsedInput = parsed(input);
    const first = await createPromoOperationFromParsedSubject(parsedInput);
    const repeated = await createPromoOperationFromParsedSubject(parsedInput);
    const expectedPartners = ["Kibernetiki", "iSpace", "KTC", "Comfy", "Foxtrot", "Epicentr", "Citrus", "Rozetka"];
    const promos = await prisma.promo.findMany({ include: { partners: { include: { partner: true } } } });

    expect(first.promos).toHaveLength(8);
    expect(new Set(first.promos.map(({ promo }) => promo.id)).size).toBe(1);
    expect(repeated.promos.every(({ createdPromo, createdPromoPartner }) => !createdPromo && !createdPromoPartner)).toBe(true);
    expect(promos).toHaveLength(1);
    expect(promos[0]).toMatchObject({
      name: "Комерційні умови Mac, iPad - FYQ4'26 ОЧ18 01.10-31.12",
      lob: "Mac iPad",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(promos[0]!.partners.map(({ partner }) => partner.name)).toEqual(expectedPartners);
    expect(promos[0]!.partners.every(({ rawEmailSubject }) => rawEmailSubject === input)).toBe(true);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(8);
  });

  it("deduplicates repeated partner aliases when persisting a credit promo", async () => {
    const input = "ОЧ18 Приват iPhone promotion 01.10-31.12 - Kibernetiki kibernetiki KTC ктс";
    const result = await createPromoOperationFromParsedSubject(parsed(input));

    expect(result.promos.map(({ partner }) => partner.name)).toEqual(["Kibernetiki", "KTC"]);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(2);
  });

  it("keeps single-partner credit creation on the scalar path", async () => {
    const result = await createPromoFromParsedSubject(parsed("ОЧ18 Приват iPhone promotion 01.10-31.12 - Citrus"));
    expect(result.partner.name).toBe("Citrus");
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(1);
  });

  it("creates one Promo, Partner, and PromoPartner", async () => {
    const result = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    expect(result).toMatchObject({ createdPromo: true, createdPartner: true, createdPromoPartner: true });
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.partner.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(1);
    expect(result.promo.startDate.toISOString()).toBe("2026-09-07T00:00:00.000Z");
  });

  it("preserves a complete multi-line Telegram source verbatim", async () => {
    const input = "Lob: AirPods & Apple Watch\nPartner: Citrus\nПеріод: 28.09-04.10\nApple Watch 12\nAirPods 5";
    const result = await createPromoFromParsedSubject(parsed(input));
    expect(result.promoPartner.rawEmailSubject).toBe(input);
    expect(result.promo).toMatchObject({ lob: "AW & AirPods", name: "AirPods & Apple Watch" });
  });

  it("reuses all records for an identical submission", async () => {
    await createPromoFromParsedSubject(parsed(iphoneRozetka));
    const second = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    expect(second).toMatchObject({ createdPromo: false, createdPartner: false, createdPromoPartner: false });
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.partner.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(1);
  });

  it("reuses a promo across different partners", async () => {
    await createPromoFromParsedSubject(parsed(iphoneRozetka));
    await createPromoFromParsedSubject(parsed("Promo iPhone 17 Pro 07.09-13.09 - MOYO"));
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.partner.count()).toBe(2);
    expect(await prisma.promoPartner.count()).toBe(2);
  });

  it("keeps repeated FSM submissions idempotent for the same canonical partner", async () => {
    const input = "FSM Comfy iPhone 07.10-20.10";
    const first = await createPromoFromParsedSubject(parsed(input));
    const second = await createPromoFromParsedSubject(parsed(input));
    expect(first.promo.name).toBe("FSM iPhone");
    expect(first.promo.normalizedName).toBe("!fsm:Comfy:fsm iphone");
    expect(second).toMatchObject({ createdPromo: false, createdPromoPartner: false, isFsm: true });
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(1);
  });

  it("isolates identical FSM promotions by canonical partner", async () => {
    const comfy = await createPromoFromParsedSubject(parsed("FSM Comfy iPhone 07.10-20.10"));
    const rozetka = await createPromoFromParsedSubject(parsed("FSM Rozetka iPhone 07.10-20.10"));
    expect(comfy.promo.id).not.toBe(rozetka.promo.id);
    expect(await prisma.promo.count()).toBe(2);
    expect(await prisma.promoPartner.count()).toBe(2);
    const rows = await prisma.promo.findMany({ include: { partners: { include: { partner: true } } } });
    expect(rows.map(({ partners }) => partners.map(({ partner }) => partner.name)).sort((a, b) => a[0]!.localeCompare(b[0]!))).toEqual([["Comfy"], ["Rozetka"]]);
    expect(rows.every(({ name }) => name.startsWith("FSM"))).toBe(true);
  });

  it("does not collide between FSM and standard promos with the same LOB and dates", async () => {
    const fsm = await createPromoFromParsedSubject(parsed("FSM Comfy iPhone 07.10-20.10"));
    const standard = await createPromoFromParsedSubject(parsed("Comfy iPhone 07.10-20.10"));
    expect(fsm.promo.id).not.toBe(standard.promo.id);
    expect(await prisma.promo.count()).toBe(2);
    expect(await prisma.promoPartner.count()).toBe(2);
  });

  it("enforces the single-partner FSM invariant in the domain path", async () => {
    const parsedInput = parsed("FSM Comfy iPhone 07.10-20.10 - Rozetka");
    await expect(createPromoFromParsedSubject({ ...parsedInput, isValid: true, partner: "Comfy" }))
      .rejects.toBeInstanceOf(InvalidParsedPromoSubjectError);
    expect(await prisma.promo.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
  });

  it("does not let FSM ingestion bypass a CLOSED end-date quarter", async () => {
    const user = await prisma.user.create({ data: { email: "fsm-closer@test.local", passwordHash: "hash", role: "SUPERUSER" } });
    await prisma.reportingPeriod.create({ data: { year: 2026, quarter: 3, lob: "iPhone", status: "CLOSED", closedByUserId: user.id, closedAt: now } });
    await expect(createPromoFromParsedSubject(parsed("FSM Comfy iPhone 10.07-20.07")))
      .rejects.toBeInstanceOf(ClosedReportingPeriodError);
    expect(await prisma.promo.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
  });

  it("reuses one neutral Promo for structured subjects received through different partners", async () => {
    await createPromoFromParsedSubject(parsed("Нова лінійка NPI Accessories Apple - Kibernetiki (Offer & Split) - 25.09-27.09"));
    await createPromoFromParsedSubject(parsed("Нова лінійка NPI Accessories Apple - iSpace (Offer & Split) - 25.09-27.09"));
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(2);
    expect((await prisma.promo.findFirstOrThrow()).name).toBe("Нова лінійка NPI Accessories Apple (Offer & Split)");
  });

  it("reuses a partner across different promos", async () => {
    await createPromoFromParsedSubject(parsed(iphoneRozetka));
    await createPromoFromParsedSubject(parsed("Promo AirPods Pro 3 07.09-13.09 - Rozetka"));
    expect(await prisma.promo.count()).toBe(2);
    expect(await prisma.partner.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(2);
  });

  it("rejects invalid parser output without writing records", async () => {
    await expect(createPromoFromParsedSubject(parsed("Unknown promo"))).rejects.toBeInstanceOf(
      InvalidParsedPromoSubjectError,
    );
    expect(await prisma.promo.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
  });

  it("updates the raw subject on repeat submission", async () => {
    const first = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    const updated = { ...parsed(iphoneRozetka), rawSubject: `Re: UPDATE! ${iphoneRozetka}` };
    const second = await createPromoFromParsedSubject(updated);
    expect(second.promoPartner.id).toBe(first.promoPartner.id);
    expect(second.promoPartner.rawEmailSubject).toBe(updated.rawSubject);
    expect(await prisma.promoPartner.count()).toBe(1);
  });

  it("does not reset report state on repeat submission", async () => {
    const first = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    const receivedAt = new Date("2026-09-14T09:00:00.000Z");
    await markReportReceived(first.promoPartner.id, receivedAt);
    const repeated = await createPromoFromParsedSubject({
      ...parsed(iphoneRozetka),
      rawSubject: `Re: ${iphoneRozetka}`,
    });
    expect(repeated.promoPartner).toMatchObject({ reportReceived: true, reportReceivedAt: receivedAt });
  });

  it("marks a report received and pending", async () => {
    const { promoPartner } = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    const receivedAt = new Date("2026-09-14T09:00:00.000Z");
    expect(await markReportReceived(promoPartner.id, receivedAt)).toMatchObject({
      reportReceived: true,
      reportReceivedAt: receivedAt,
    });
    expect(await markReportPending(promoPartner.id)).toMatchObject({
      reportReceived: false,
      reportReceivedAt: null,
    });
  });

  it("returns only pending reports for finished promos", async () => {
    const expired = await createPromoFromParsedSubject(
      parsed("Promo iPhone 17 Pro 01.08-05.08 - Rozetka"),
    );
    await createPromoFromParsedSubject(parsed(iphoneRozetka));
    const received = await createPromoFromParsedSubject(
      parsed("Promo AirPods Pro 3 01.08-05.08 - MOYO"),
    );
    await markReportReceived(received.promoPartner.id, now);

    const pending = await getPendingReports(now);
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(expired.promoPartner.id);
    expect(pending[0].promo.name).toBe("Promo iPhone 17 Pro");
    expect(pending[0].partner.name).toBe("Rozetka");
  });

  it("does not return a pending report during the promo end date", async () => {
    await createPromoFromParsedSubject(
      parsed("Promo iPhone 17 Pro 01.09-13.09 - Rozetka"),
    );

    expect(await getPendingReports(new Date("2026-09-13T10:00:00.000Z"))).toHaveLength(0);
    expect(await getPendingReports(new Date("2026-09-13T23:59:59.000Z"))).toHaveLength(0);
  });

  it("returns a pending report from the following calendar day", async () => {
    const created = await createPromoFromParsedSubject(
      parsed("Promo iPhone 17 Pro 01.09-13.09 - Rozetka"),
    );

    const pending = await getPendingReports(new Date("2026-09-14T00:00:00.000Z"));
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe(created.promoPartner.id);
  });

  it("returns promos with partner participation from query services", async () => {
    const created = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    const all = await getAllPromos();
    const byId = await getPromoById(created.promo.id);
    expect(all[0].partners[0].partner.name).toBe("Rozetka");
    expect(byId?.partners[0].partner.name).toBe("Rozetka");
  });

  it("does not duplicate the same partner name", async () => {
    await createPromoFromParsedSubject(parsed(iphoneRozetka));
    await createPromoFromParsedSubject(parsed("Promo AirPods Pro 3 14.09-20.09 - Rozetka"));
    expect(await prisma.partner.count({ where: { name: "Rozetka" } })).toBe(1);
  });

  it("creates a new promo when only the period changes", async () => {
    await createPromoFromParsedSubject(parsed(iphoneRozetka));
    await createPromoFromParsedSubject(parsed("Promo iPhone 17 Pro 14.09-20.09 - Rozetka"));
    expect(await prisma.promo.count()).toBe(2);
  });
});
