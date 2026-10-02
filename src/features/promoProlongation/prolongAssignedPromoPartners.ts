import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";
import { assertReportingPeriodOpen } from "../quarterlyReporting/closedPeriods.js";
import { quarterDateRange, quarterForEndDate } from "../quarterlyReporting/quarter.js";

export class InvalidScopedProlongationError extends Error {}
export class ScopedProlongationConflictError extends Error {}

export type ScopedProlongationResult = {
  kind: "extended" | "split";
  refreshRequired: true;
};

type TransactionRunner = <T>(work: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;

const defaultTransactionRunner: TransactionRunner = (work) => prisma.$transaction(work, {
  isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
});

const parseCalendarDate = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new InvalidScopedProlongationError("endDate must use YYYY-MM-DD");
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) {
    throw new InvalidScopedProlongationError("endDate is not a valid calendar date");
  }
  return date;
};

const nextQuarter = (year: number, quarter: number) => quarter === 4
  ? { year: year + 1, quarter: 1 }
  : { year, quarter: quarter + 1 };

const isSqliteBusy = (error: unknown): boolean => {
  if (!(error instanceof Error)) return false;
  const code = "code" in error ? String(error.code) : "";
  return ["P1008", "SQLITE_BUSY", "SQLITE_LOCKED"].includes(code)
    || /database is (?:locked|busy)|SQLITE_(?:BUSY|LOCKED)/i.test(error.message);
};

export async function withSqliteBusyRetry<T>(operation: () => Promise<T>, attempts = 3): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= attempts || !isSqliteBusy(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 10));
    }
  }
}

type PromoIdentity = { lob: string; normalizedName: string; startDate: Date; endDate: Date };

async function findOrCreateTarget(
  tx: Prisma.TransactionClient,
  source: { name: string },
  identity: PromoIdentity,
  operationTime: Date,
) {
  const target = await tx.promo.upsert({
    where: { lob_normalizedName_startDate_endDate: identity },
    create: { ...identity, name: source.name, prolongedAt: operationTime },
    update: {},
  });
  await assertReportingPeriodOpen(target, tx);
  if (!target.prolongedAt || target.prolongedAt < operationTime) {
    return tx.promo.update({ where: { id: target.id }, data: { prolongedAt: operationTime } });
  }
  return target;
}

const assertNoTargetPartnerConflict = async (
  tx: Prisma.TransactionClient,
  targetPromoIds: string[],
  partnerIds: string[],
) => {
  if (await tx.promoPartner.count({ where: { promoId: { in: targetPromoIds }, partnerId: { in: partnerIds } } })) {
    throw new ScopedProlongationConflictError("Selected partner participation conflicts with an existing target");
  }
};

export async function prolongAssignedPromoPartners(
  promoId: string,
  promoPartnerIds: string[],
  requestedEndDate: string,
  userId: number,
  operationTime: Date = new Date(),
  runTransaction: TransactionRunner = defaultTransactionRunner,
): Promise<ScopedProlongationResult | null> {
  if (!Array.isArray(promoPartnerIds) || promoPartnerIds.length === 0 || promoPartnerIds.some((id) => typeof id !== "string" || !id)) {
    throw new InvalidScopedProlongationError("At least one promoPartnerId is required");
  }
  if (new Set(promoPartnerIds).size !== promoPartnerIds.length) {
    throw new InvalidScopedProlongationError("promoPartnerIds must not contain duplicates");
  }
  const newEndDate = parseCalendarDate(requestedEndDate);
  const requestTime = new Date(operationTime);

  try {
    return await withSqliteBusyRetry(() => runTransaction(async (tx) => {
      const source = await tx.promo.findUnique({ where: { id: promoId }, include: { partners: true } });
      if (!source) return null;
      const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
      if (!actor?.isActive || actor.role !== "KAM") return null;
      const assigned = new Set((await tx.userPartner.findMany({ where: { userId }, select: { partnerId: true } })).map(({ partnerId }) => partnerId));
      if (!source.partners.some(({ partnerId }) => assigned.has(partnerId))) return null;
      const sourceById = new Map(source.partners.map((relation) => [relation.id, relation]));
      const selected = promoPartnerIds.map((id) => sourceById.get(id));
      if (selected.some((relation) => !relation || !assigned.has(relation.partnerId))) {
        throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
      }
      await assertReportingPeriodOpen(source, tx);
      if (toUtcCalendarDate(requestTime) > source.endDate) {
        throw new ScopedProlongationConflictError("Promo is no longer eligible for prolongation");
      }
      if (newEndDate <= source.endDate) throw new InvalidScopedProlongationError("endDate must be later than the current endDate");

      const currentQuarter = quarterForEndDate(source.endDate);
      const targetQuarter = quarterForEndDate(newEndDate);
      const following = nextQuarter(currentQuarter.year, currentQuarter.quarter);
      const sameQuarter = currentQuarter.year === targetQuarter.year && currentQuarter.quarter === targetQuarter.quarter;
      if (!sameQuarter && (targetQuarter.year !== following.year || targetQuarter.quarter !== following.quarter)) {
        throw new InvalidScopedProlongationError("endDate must be in the current or immediately following quarter");
      }

      const selectedRelations = selected as typeof source.partners;
      const selectedPartnerIds = selectedRelations.map(({ partnerId }) => partnerId);
      const allActualSelected = selectedRelations.length === source.partners.length;

      if (sameQuarter) {
        const existingTarget = await tx.promo.findUnique({
          where: { lob_normalizedName_startDate_endDate: { lob: source.lob, normalizedName: source.normalizedName, startDate: source.startDate, endDate: newEndDate } },
        });
        if (allActualSelected && !existingTarget) {
          await tx.promo.update({ where: { id: source.id }, data: { endDate: newEndDate, prolongedAt: requestTime } });
          return { kind: "extended", refreshRequired: true };
        }
        const target = await findOrCreateTarget(tx, source, { lob: source.lob, normalizedName: source.normalizedName, startDate: source.startDate, endDate: newEndDate }, requestTime);
        await assertNoTargetPartnerConflict(tx, [target.id], selectedPartnerIds);
        const moved = await tx.promoPartner.updateMany({ where: { id: { in: promoPartnerIds }, promoId: source.id }, data: { promoId: target.id } });
        if (moved.count !== promoPartnerIds.length) throw new ScopedProlongationConflictError("Selected partner participation is stale");
        if (!await tx.promoPartner.count({ where: { promoId: source.id } })) {
          await assertReportingPeriodOpen(source, tx);
          await tx.promo.delete({ where: { id: source.id } });
        }
        return { kind: "extended", refreshRequired: true };
      }

      const continuationStart = quarterDateRange(currentQuarter.year, currentQuarter.quarter).end;
      const currentQuarterEnd = new Date(continuationStart.getTime() - 24 * 60 * 60 * 1000);
      await assertReportingPeriodOpen({ lob: source.lob, endDate: currentQuarterEnd }, tx);
      await assertReportingPeriodOpen({ lob: source.lob, endDate: newEndDate }, tx);
      const currentIdentity = { lob: source.lob, normalizedName: source.normalizedName, startDate: source.startDate, endDate: currentQuarterEnd };
      const continuationIdentity = { lob: source.lob, normalizedName: source.normalizedName, startDate: continuationStart, endDate: newEndDate };
      const existingCurrent = await tx.promo.findUnique({ where: { lob_normalizedName_startDate_endDate: currentIdentity } });
      const existingContinuation = await tx.promo.findUnique({ where: { lob_normalizedName_startDate_endDate: continuationIdentity } });

      if (allActualSelected && !existingCurrent && !existingContinuation) {
        await tx.promo.update({ where: { id: source.id }, data: { endDate: currentQuarterEnd, prolongedAt: requestTime } });
        await tx.promo.create({
          data: {
            ...continuationIdentity,
            name: source.name,
            prolongedAt: requestTime,
            partners: { create: selectedPartnerIds.map((partnerId) => ({ partnerId, rawEmailSubject: null })) },
          },
        });
        return { kind: "split", refreshRequired: true };
      }

      const currentTarget = existingCurrent?.id === source.id
        ? source
        : await findOrCreateTarget(tx, source, currentIdentity, requestTime);
      const continuationTarget = await findOrCreateTarget(tx, source, continuationIdentity, requestTime);
      await assertReportingPeriodOpen(currentTarget, tx);
      const conflictTargetIds = [continuationTarget.id, ...(currentTarget.id === source.id ? [] : [currentTarget.id])];
      await assertNoTargetPartnerConflict(tx, conflictTargetIds, selectedPartnerIds);

      if (currentTarget.id === source.id && allActualSelected && (!source.prolongedAt || source.prolongedAt < requestTime)) {
        await tx.promo.update({ where: { id: source.id }, data: { prolongedAt: requestTime } });
      }

      if (currentTarget.id !== source.id) {
        const moved = await tx.promoPartner.updateMany({ where: { id: { in: promoPartnerIds }, promoId: source.id }, data: { promoId: currentTarget.id } });
        if (moved.count !== promoPartnerIds.length) throw new ScopedProlongationConflictError("Selected partner participation is stale");
      }
      await tx.promoPartner.createMany({ data: selectedPartnerIds.map((partnerId) => ({ promoId: continuationTarget.id, partnerId, rawEmailSubject: null })) });
      if (!await tx.promoPartner.count({ where: { promoId: source.id } })) {
        await assertReportingPeriodOpen(source, tx);
        await tx.promo.delete({ where: { id: source.id } });
      }
      return { kind: "split", refreshRequired: true };
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ScopedProlongationConflictError("Concurrent target conflict; refresh the workspace");
    }
    throw error;
  }
}
