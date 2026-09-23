import { Prisma, type ReportingPeriodStatus } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { orderPartnerNames } from "../partnerQueries/getPartnerNames.js";
import { quarterDateRange, quarterForEndDate } from "./quarter.js";

type Db = typeof prisma | Prisma.TransactionClient;
export type PendingQuarterReport = { promoPartnerId: string; promoId: string; promoName: string; startDate: Date; endDate: Date; partnerId: string; partnerName: string };
export type PartnerQuarterProgress = { partnerId: string; partnerName: string; expectedReports: number; receivedReports: number; pendingReports: number; pending: PendingQuarterReport[] };
export type QuarterlySummary = {
  year: number; quarter: number; lob: string; status: ReportingPeriodStatus; ready: boolean;
  closedAt: Date | null; closedBy: { id: number; email: string } | null;
  promoCount: number; expectedReports: number; receivedReports: number; pendingReports: number; completionPercentage: number;
  partners: PartnerQuarterProgress[]; pending: PendingQuarterReport[];
};
export type ArchivedPeriod = QuarterlySummary & { id: string };
export type ArchivedPeriodDetail = ArchivedPeriod & { promos: Array<{ id: string; lob: string; name: string; startDate: Date; endDate: Date; partners: Array<{ promoPartnerId: string; partnerId: string; partnerName: string; reportReceived: boolean; reportReceivedAt: Date | null; rawEmailSubject: string | null }> }> };

export class EmptyReportingPeriodError extends Error { constructor() { super("Reporting period has no expected reports"); } }
export class ReportingPeriodNotReadyError extends Error { constructor() { super("Reporting period still has pending reports"); } }

export async function getQuarterlySummary(year: number, quarter: number, lob: string, db: Db = prisma): Promise<QuarterlySummary> {
  const { start, end } = quarterDateRange(year, quarter);
  const [promos, period] = await Promise.all([
    db.promo.findMany({ where: { lob, endDate: { gte: start, lt: end } }, include: { partners: { include: { partner: true } } }, orderBy: [{ endDate: "asc" }, { name: "asc" }] }),
    db.reportingPeriod.findUnique({ where: { year_quarter_lob: { year, quarter, lob } }, include: { closedBy: { select: { id: true, email: true } } } }),
  ]);
  const partnerMap = new Map<string, PartnerQuarterProgress>();
  const pending: PendingQuarterReport[] = [];
  let expectedReports = 0; let receivedReports = 0;
  for (const promo of promos) for (const relation of promo.partners) {
    expectedReports += 1; if (relation.reportReceived) receivedReports += 1;
    const detail = { promoPartnerId: relation.id, promoId: promo.id, promoName: promo.name, startDate: promo.startDate, endDate: promo.endDate, partnerId: relation.partnerId, partnerName: relation.partner.name };
    const progress = partnerMap.get(relation.partnerId) ?? { partnerId: relation.partnerId, partnerName: relation.partner.name, expectedReports: 0, receivedReports: 0, pendingReports: 0, pending: [] };
    progress.expectedReports += 1;
    if (relation.reportReceived) progress.receivedReports += 1; else { progress.pendingReports += 1; progress.pending.push(detail); pending.push(detail); }
    partnerMap.set(relation.partnerId, progress);
  }
  const pendingReports = expectedReports - receivedReports;
  const orderedNames = orderPartnerNames([...partnerMap.values()].map(({ partnerName }) => partnerName));
  const byName = new Map([...partnerMap.values()].map((progress) => [progress.partnerName, progress]));
  return {
    year, quarter, lob, status: period?.status ?? "OPEN", ready: expectedReports > 0 && pendingReports === 0 && period?.status !== "CLOSED",
    closedAt: period?.closedAt ?? null, closedBy: period?.closedBy ?? null,
    promoCount: promos.length, expectedReports, receivedReports, pendingReports,
    completionPercentage: expectedReports ? Math.round(receivedReports / expectedReports * 1000) / 10 : 0,
    partners: orderedNames.flatMap((name) => byName.get(name) ?? []), pending,
  };
}

export async function listQuarterlySelections(now: Date = new Date()) {
  const promos = await prisma.promo.findMany({ select: { lob: true, endDate: true } });
  const current = quarterForEndDate(now);
  const quarters = new Map<string, { year: number; quarter: number }>([[`${current.year}-${current.quarter}`, current]]);
  const lobs = new Set<string>();
  for (const promo of promos) { const q = quarterForEndDate(promo.endDate); quarters.set(`${q.year}-${q.quarter}`, q); lobs.add(promo.lob); }
  return { quarters: [...quarters.values()].sort((a, b) => b.year - a.year || b.quarter - a.quarter), lobs: [...lobs].sort((a, b) => a.localeCompare(b)) };
}

export async function closeReportingPeriod(year: number, quarter: number, lob: string, userId: number, closedAt: Date = new Date()) {
  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.reportingPeriod.findUnique({ where: { year_quarter_lob: { year, quarter, lob } } });
    if (existing?.status === "CLOSED") return { alreadyClosed: true };
    const { start, end } = quarterDateRange(year, quarter);
    const expectedReports = await tx.promoPartner.count({ where: { promo: { lob, endDate: { gte: start, lt: end } } } });
    if (expectedReports === 0) throw new EmptyReportingPeriodError();
    const pendingReports = await tx.promoPartner.count({ where: { reportReceived: false, promo: { lob, endDate: { gte: start, lt: end } } } });
    if (pendingReports > 0) throw new ReportingPeriodNotReadyError();
    await tx.reportingPeriod.upsert({
      where: { year_quarter_lob: { year, quarter, lob } },
      create: { year, quarter, lob, status: "CLOSED", closedAt, closedByUserId: userId },
      update: { status: "CLOSED", closedAt, closedByUserId: userId },
    });
    return { alreadyClosed: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ...(await getQuarterlySummary(year, quarter, lob)), alreadyClosed: result.alreadyClosed };
}

export async function listArchivedPeriods(): Promise<ArchivedPeriod[]> {
  const periods = await prisma.reportingPeriod.findMany({ where: { status: "CLOSED" }, orderBy: [{ year: "desc" }, { quarter: "desc" }, { lob: "asc" }] });
  return Promise.all(periods.map(async (period) => ({ id: period.id, ...(await getQuarterlySummary(period.year, period.quarter, period.lob)) })));
}

export async function getArchivedPeriod(id: string): Promise<ArchivedPeriodDetail | null> {
  const period = await prisma.reportingPeriod.findFirst({ where: { id, status: "CLOSED" } });
  if (!period) return null;
  const { start, end } = quarterDateRange(period.year, period.quarter);
  const promos = await prisma.promo.findMany({
    where: { lob: period.lob, endDate: { gte: start, lt: end } },
    include: { partners: { include: { partner: true } } }, orderBy: [{ endDate: "asc" }, { name: "asc" }],
  });
  return {
    id, ...(await getQuarterlySummary(period.year, period.quarter, period.lob)),
    promos: promos.map((promo) => ({ id: promo.id, lob: promo.lob, name: promo.name, startDate: promo.startDate, endDate: promo.endDate, partners: promo.partners.map((relation) => ({ promoPartnerId: relation.id, partnerId: relation.partnerId, partnerName: relation.partner.name, reportReceived: relation.reportReceived, reportReceivedAt: relation.reportReceivedAt, rawEmailSubject: relation.rawEmailSubject })) })),
  };
}
