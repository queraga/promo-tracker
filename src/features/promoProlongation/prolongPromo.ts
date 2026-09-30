import type { Partner, Promo, PromoPartner } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { assertReportingPeriodOpen } from "../quarterlyReporting/closedPeriods.js";
import { quarterDateRange, quarterForEndDate } from "../quarterlyReporting/quarter.js";

export class InvalidProlongationError extends Error {}

type ProlongedPromoRecord = Promo & { partners: Array<PromoPartner & { partner: Partner }> };

export type ProlongPromoResult =
  | { kind: "extended"; promo: ProlongedPromoRecord }
  | { kind: "split"; currentPromo: ProlongedPromoRecord; continuationPromo: ProlongedPromoRecord };

function parseCalendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new InvalidProlongationError("endDate must use YYYY-MM-DD");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (
    date.getUTCFullYear() !== Number(match[1]) ||
    date.getUTCMonth() !== Number(match[2]) - 1 ||
    date.getUTCDate() !== Number(match[3])
  ) throw new InvalidProlongationError("endDate is not a valid calendar date");
  return date;
}

function nextQuarter(year: number, quarter: number) {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: quarter + 1 };
}

export async function prolongPromo(
  promoId: string,
  requestedEndDate: string,
  operationTime: Date = new Date(),
): Promise<ProlongPromoResult | null> {
  const newEndDate = parseCalendarDate(requestedEndDate);
  return prisma.$transaction(async (tx) => {
    const promo = await tx.promo.findUnique({
      where: { id: promoId },
      include: { partners: { include: { partner: true } } },
    });
    if (!promo) return null;
    await assertReportingPeriodOpen(promo, tx);
    if (newEndDate <= promo.endDate) throw new InvalidProlongationError("endDate must be later than the current endDate");

    const currentQuarter = quarterForEndDate(promo.endDate);
    const targetQuarter = quarterForEndDate(newEndDate);
    if (currentQuarter.year === targetQuarter.year && currentQuarter.quarter === targetQuarter.quarter) {
      const updated = await tx.promo.update({
        where: { id: promo.id },
        data: { endDate: newEndDate, prolongedAt: operationTime },
        include: { partners: { include: { partner: true } } },
      });
      return { kind: "extended", promo: updated };
    }

    const following = nextQuarter(currentQuarter.year, currentQuarter.quarter);
    if (targetQuarter.year !== following.year || targetQuarter.quarter !== following.quarter) {
      throw new InvalidProlongationError("endDate must be in the current or immediately following quarter");
    }
    await assertReportingPeriodOpen({ lob: promo.lob, endDate: newEndDate }, tx);
    const continuationStart = quarterDateRange(currentQuarter.year, currentQuarter.quarter).end;
    const currentQuarterEnd = new Date(continuationStart.getTime() - 24 * 60 * 60 * 1000);

    const currentPromo = await tx.promo.update({
      where: { id: promo.id },
      data: { endDate: currentQuarterEnd, prolongedAt: operationTime },
      include: { partners: { include: { partner: true } } },
    });
    const continuationPromo = await tx.promo.create({
      data: {
        lob: promo.lob,
        name: promo.name,
        normalizedName: promo.normalizedName,
        startDate: continuationStart,
        endDate: newEndDate,
        prolongedAt: operationTime,
        partners: { create: promo.partners.map(({ partnerId }) => ({ partnerId, rawEmailSubject: null })) },
      },
      include: { partners: { include: { partner: true } } },
    });
    return { kind: "split", currentPromo, continuationPromo };
  });
}
