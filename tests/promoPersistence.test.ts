import { beforeEach, describe, expect, it } from "vitest";
import { createPromoFromParsedSubject } from "../src/features/createPromo/createPromoFromParsedSubject.js";
import { InvalidParsedPromoSubjectError } from "../src/features/createPromo/createPromo.types.js";
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
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

describe("promo persistence", () => {
  it("creates one Promo, Partner, and PromoPartner", async () => {
    const result = await createPromoFromParsedSubject(parsed(iphoneRozetka));
    expect(result).toMatchObject({ createdPromo: true, createdPartner: true, createdPromoPartner: true });
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.partner.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(1);
    expect(result.promo.startDate.toISOString()).toBe("2026-09-07T00:00:00.000Z");
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
