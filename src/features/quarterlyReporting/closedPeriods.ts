import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { quarterForEndDate } from "./quarter.js";

type Db = typeof prisma | Prisma.TransactionClient;
type PeriodPromo = { lob: string; endDate: Date };

export class ClosedReportingPeriodError extends Error {
  constructor() { super("Reporting period is closed"); }
}

export async function isClosedReportingPeriod(promo: PeriodPromo, db: Db = prisma): Promise<boolean> {
  const { year, quarter } = quarterForEndDate(promo.endDate);
  return (await db.reportingPeriod.count({ where: { year, quarter, lob: promo.lob, status: "CLOSED" } })) > 0;
}

export async function assertReportingPeriodOpen(promo: PeriodPromo, db: Db = prisma): Promise<void> {
  if (await isClosedReportingPeriod(promo, db)) throw new ClosedReportingPeriodError();
}

export async function excludeClosedPeriodPromos<T extends PeriodPromo>(promos: T[], db: Db = prisma): Promise<T[]> {
  const closed = await db.reportingPeriod.findMany({ where: { status: "CLOSED" }, select: { year: true, quarter: true, lob: true } });
  const keys = new Set(closed.map(({ year, quarter, lob }) => `${year}:${quarter}:${lob}`));
  return promos.filter((promo) => {
    const { year, quarter } = quarterForEndDate(promo.endDate);
    return !keys.has(`${year}:${quarter}:${promo.lob}`);
  });
}

export async function requireOpenPromoPartner(id: string, db: Db = prisma) {
  const relation = await db.promoPartner.findUnique({ where: { id }, include: { promo: true } });
  if (relation) await assertReportingPeriodOpen(relation.promo, db);
  return relation;
}
