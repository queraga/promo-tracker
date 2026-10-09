import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { withSqliteBusyRetry } from "../../shared/db/withSqliteBusyRetry.js";
import { toUtcCalendarDate } from "../../shared/date/toUtcCalendarDate.js";
import { assertReportingPeriodOpen } from "../quarterlyReporting/closedPeriods.js";
import { quarterDateRange, quarterForEndDate } from "../quarterlyReporting/quarter.js";

export { withSqliteBusyRetry };

export class InvalidScopedProlongationError extends Error {}
export class ScopedProlongationConflictError extends Error {}

export type ScopedProlongationResult = {
  kind: "extended" | "split";
  refreshRequired: true;
};
export type PromoPartnerSelection = { promoPartnerId: string; partnerId: string };

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

const moveSelectionsToTarget = async (
  tx: Prisma.TransactionClient,
  sourcePromoId: string,
  targetPromoId: string,
  selections: Array<{ id: string; partnerId: string }>,
) => {
  for (const selection of selections) {
    const existing = await tx.promoPartner.findUnique({ where: { promoId_partnerId: { promoId: targetPromoId, partnerId: selection.partnerId } } });
    if (existing) {
      const removed = await tx.promoPartner.deleteMany({ where: { id: selection.id, promoId: sourcePromoId } });
      if (removed.count !== 1) throw new ScopedProlongationConflictError("Selected partner participation is stale");
    } else {
      const moved = await tx.promoPartner.updateMany({ where: { id: selection.id, promoId: sourcePromoId }, data: { promoId: targetPromoId } });
      if (moved.count !== 1) throw new ScopedProlongationConflictError("Selected partner participation is stale");
    }
  }
};

export async function prolongAssignedPromoPartners(
  promoId: string,
  promoPartnerIds: string[] | PromoPartnerSelection[],
  requestedEndDate: string,
  userId: number,
  operationTime: Date = new Date(),
  runTransaction: TransactionRunner = defaultTransactionRunner,
): Promise<ScopedProlongationResult | null> {
  if (!Array.isArray(promoPartnerIds) || promoPartnerIds.length === 0 || promoPartnerIds.some((selection) =>
    typeof selection === "string" ? !selection : !selection || typeof selection.promoPartnerId !== "string" || !selection.promoPartnerId || typeof selection.partnerId !== "string" || !selection.partnerId)) {
    throw new InvalidScopedProlongationError("At least one promoPartnerId is required");
  }
  const requested = promoPartnerIds.map((selection) => typeof selection === "string" ? { id: selection, partnerId: null as string | null } : { id: selection.promoPartnerId, partnerId: selection.partnerId });
  if (new Set(requested.map(({ id }) => id)).size !== requested.length || new Set(requested.flatMap(({ partnerId }) => partnerId ? [partnerId] : [])).size !== requested.filter(({ partnerId }) => partnerId).length) {
    throw new InvalidScopedProlongationError("promoPartnerIds must not contain duplicates");
  }
  const parsedEndDate = parseCalendarDate(requestedEndDate);
  const requestTime = new Date(operationTime);

  try {
    return await withSqliteBusyRetry(() => runTransaction(async (tx) => {
      const source = await tx.promo.findUnique({ where: { id: promoId }, include: { partners: true } });
      if (!source) return null;
      const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
      if (!actor?.isActive || (actor.role !== "KAM" && actor.role !== "SUPERUSER")) return null;
      const assigned = new Set((await tx.userPartner.findMany({ where: { userId }, select: { partnerId: true } })).map(({ partnerId }) => partnerId));
      const sourceById = new Map(source.partners.map((relation) => [relation.id, relation]));
      const requestedEnd = parsedEndDate;
      const requestedQuarter = quarterForEndDate(requestedEnd);
      const sourceQuarter = quarterForEndDate(source.endDate);
      const retryTargetIdentity = sourceQuarter.year === requestedQuarter.year && sourceQuarter.quarter === requestedQuarter.quarter
        ? { lob: source.lob, normalizedName: source.normalizedName, startDate: source.startDate, endDate: requestedEnd }
        : { lob: source.lob, normalizedName: source.normalizedName, startDate: new Date(quarterDateRange(sourceQuarter.year, sourceQuarter.quarter).end.getTime() + 24 * 60 * 60 * 1000), endDate: requestedEnd };
      const selected = requested.map(({ id }) => sourceById.get(id));
      const actualSelections: Array<{ id: string; partnerId: string }> = [];
      for (const [index, relation] of selected.entries()) {
        const suppliedPartnerId = requested[index]!.partnerId;
        if (relation) {
          if (suppliedPartnerId && relation.partnerId !== suppliedPartnerId) throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
          actualSelections.push({ id: relation.id, partnerId: relation.partnerId });
        } else if (suppliedPartnerId) {
          actualSelections.push({ id: requested[index]!.id, partnerId: suppliedPartnerId });
        }
      }
      if (actor.role === "KAM" && !source.partners.some(({ partnerId }) => assigned.has(partnerId))) return null;
      if (actor.role === "KAM" && actualSelections.some(({ partnerId }) => !assigned.has(partnerId))) {
        throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
      }
      const missingFromSource = selected.some((relation) => !relation);
      if (missingFromSource) {
        if (requested.some(({ partnerId }) => !partnerId)) throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
        const retryTarget = await tx.promo.findUnique({ where: { lob_normalizedName_startDate_endDate: retryTargetIdentity }, include: { partners: true } });
        if (!retryTarget || actualSelections.some(({ partnerId }) => !retryTarget.partners.some((relation) => relation.partnerId === partnerId))) {
          throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
        }
        if (actor.role === "KAM" && actualSelections.some(({ partnerId }) => !assigned.has(partnerId))) throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
        await assertReportingPeriodOpen(source, tx);
        await assertReportingPeriodOpen(retryTarget, tx);
        return { kind: sourceQuarter.year === requestedQuarter.year && sourceQuarter.quarter === requestedQuarter.quarter ? "extended" : "split", refreshRequired: true };
      }
      if (actor.role === "KAM" && toUtcCalendarDate(requestTime) > source.endDate) {
        throw new ScopedProlongationConflictError("Promo is no longer eligible for prolongation");
      }
      if (requestedEnd <= source.endDate) {
        if (requestedEnd.getTime() === source.endDate.getTime() && source.prolongedAt) return { kind: "extended", refreshRequired: true };
        throw new InvalidScopedProlongationError("endDate must be later than the current endDate");
      }
      await assertReportingPeriodOpen(source, tx);
      const newEndDate = requestedEnd;

      const currentQuarter = quarterForEndDate(source.endDate);
      const targetQuarter = quarterForEndDate(newEndDate);
      const following = nextQuarter(currentQuarter.year, currentQuarter.quarter);
      const sameQuarter = currentQuarter.year === targetQuarter.year && currentQuarter.quarter === targetQuarter.quarter;
      if (!sameQuarter && (targetQuarter.year !== following.year || targetQuarter.quarter !== following.quarter)) {
        throw new InvalidScopedProlongationError("endDate must be in the current or immediately following quarter");
      }

      const selectedRelations = selected as typeof source.partners;
      const selectedPartnerIds = actualSelections.map(({ partnerId }) => partnerId);
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
        await moveSelectionsToTarget(tx, source.id, target.id, actualSelections);
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
      if (currentTarget.id === source.id && (!source.prolongedAt || source.prolongedAt < requestTime)) {
        await tx.promo.update({ where: { id: source.id }, data: { prolongedAt: requestTime } });
      }

      if (currentTarget.id !== source.id) {
        await moveSelectionsToTarget(tx, source.id, currentTarget.id, actualSelections);
      }
      const continuationPartnerIds = (await tx.promoPartner.findMany({ where: { promoId: continuationTarget.id }, select: { partnerId: true } })).map(({ partnerId }) => partnerId);
      await tx.promoPartner.createMany({ data: selectedPartnerIds.filter((partnerId) => !continuationPartnerIds.includes(partnerId)).map((partnerId) => ({ promoId: continuationTarget.id, partnerId, rawEmailSubject: null })) });
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
