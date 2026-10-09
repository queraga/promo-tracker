import { Prisma } from "@prisma/client";
import { createHash } from "node:crypto";
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
type AssociationSnapshot = {
  id: string;
  partnerId: string;
  rawEmailSubject: string | null;
  reportReceived: boolean;
  reportReceivedAt: Date | null;
  firstReminderSentAt: Date | null;
  secondReminderSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const sorted = (values: string[]) => [...values].sort();

const operationFingerprint = (sourcePromoId: string, associationIds: string[], partnerIds: string[], requestedEndDate: Date) =>
  createHash("sha256").update(JSON.stringify({
    sourcePromoId,
    associationIds: sorted(associationIds),
    partnerIds: sorted(partnerIds),
    requestedEndDate: requestedEndDate.toISOString(),
  })).digest("hex");

const authorizeReplay = async (tx: Prisma.TransactionClient, userId: number, partnerIds: string[]) => {
  const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
  if (!actor?.isActive || (actor.role !== "KAM" && actor.role !== "SUPERUSER")) return false;
  if (actor.role === "KAM") {
    const assigned = new Set((await tx.userPartner.findMany({ where: { userId }, select: { partnerId: true } })).map(({ partnerId }) => partnerId));
    if (partnerIds.some((partnerId) => !assigned.has(partnerId))) return false;
  }
  return true;
};

async function findCompletedOperation(
  tx: Prisma.TransactionClient,
  sourcePromoId: string,
  requested: Array<{ id: string; partnerId: string | null }>,
  requestedEndDate: Date,
  userId: number,
) {
  const candidates = await tx.promoProlongationOperation.findMany({
    where: { sourcePromoId, requestedEndDate },
    include: { associations: true },
  });
  const requestedIds = sorted(requested.map(({ id }) => id));
  const candidate = candidates.find((operation) => {
    const associationIds = sorted(operation.associations.map(({ sourcePromoPartnerId }) => sourcePromoPartnerId));
    if (associationIds.length !== requestedIds.length || associationIds.some((id, index) => id !== requestedIds[index])) return false;
    const partnerIds = sorted(operation.associations.map(({ partnerId }) => partnerId));
    if (requested.some(({ id, partnerId }) => partnerId && operation.associations.find(({ sourcePromoPartnerId }) => sourcePromoPartnerId === id)?.partnerId !== partnerId)) return false;
    return operation.fingerprint === operationFingerprint(sourcePromoId, associationIds, partnerIds, requestedEndDate);
  });
  if (!candidate) return null;
  const partnerIds = candidate.associations.map(({ partnerId }) => partnerId);
  if (!await authorizeReplay(tx, userId, partnerIds)) return null;
  await assertReportingPeriodOpen({ lob: candidate.sourceLob, endDate: candidate.sourceEndDate }, tx);

  const targetIds = [candidate.resultTargetPromoId, candidate.resultContinuationPromoId].filter((id): id is string => Boolean(id));
  const targets = await tx.promo.findMany({ where: { id: { in: targetIds } }, include: { partners: true } });
  if (targets.length !== targetIds.length) throw new ScopedProlongationConflictError("The completed prolongation target is no longer available");
  for (const target of targets) {
    await assertReportingPeriodOpen(target, tx);
    const targetPartnerIds = new Set(target.partners.map(({ partnerId }) => partnerId));
    if (partnerIds.some((partnerId) => !targetPartnerIds.has(partnerId))) {
      throw new ScopedProlongationConflictError("The completed prolongation target has changed; refresh the workspace");
    }
  }
  if (candidate.resultKind !== "extended" && candidate.resultKind !== "split") {
    throw new ScopedProlongationConflictError("The completed prolongation result is invalid");
  }
  const kind = candidate.resultKind as ScopedProlongationResult["kind"];
  return { kind, refreshRequired: true as const };
}

async function recordOperation(
  tx: Prisma.TransactionClient,
  input: {
    sourcePromoId: string;
    sourceLob: string;
    sourceEndDate: Date;
    requestedEndDate: Date;
    result: ScopedProlongationResult;
    targetPromoId: string;
    continuationPromoId?: string;
    operationTime: Date;
    snapshots: AssociationSnapshot[];
  },
) {
  const associationIds = input.snapshots.map(({ id }) => id);
  const partnerIds = input.snapshots.map(({ partnerId }) => partnerId);
  await tx.promoProlongationOperation.create({
    data: {
      fingerprint: operationFingerprint(input.sourcePromoId, associationIds, partnerIds, input.requestedEndDate),
      sourcePromoId: input.sourcePromoId,
      sourceLob: input.sourceLob,
      sourceEndDate: input.sourceEndDate,
      requestedEndDate: input.requestedEndDate,
      resultKind: input.result.kind,
      resultTargetPromoId: input.targetPromoId,
      resultContinuationPromoId: input.continuationPromoId ?? null,
      createdAt: input.operationTime,
      associations: { create: input.snapshots.map((snapshot) => ({
        sourcePromoPartnerId: snapshot.id,
        partnerId: snapshot.partnerId,
        rawEmailSubject: snapshot.rawEmailSubject,
        reportReceived: snapshot.reportReceived,
        reportReceivedAt: snapshot.reportReceivedAt,
        firstReminderSentAt: snapshot.firstReminderSentAt,
        secondReminderSentAt: snapshot.secondReminderSentAt,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
      })) },
    },
  });
}

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
      const actor = await tx.user.findUnique({ where: { id: userId }, select: { role: true, isActive: true } });
      if (!actor?.isActive || (actor.role !== "KAM" && actor.role !== "SUPERUSER")) return null;
      const assigned = new Set((await tx.userPartner.findMany({ where: { userId }, select: { partnerId: true } })).map(({ partnerId }) => partnerId));
      const completed = await findCompletedOperation(tx, promoId, requested, parsedEndDate, userId);
      if (completed) return completed;

      const source = await tx.promo.findUnique({ where: { id: promoId }, include: { partners: true } });
      if (!source) return null;
      const sourceById = new Map(source.partners.map((relation) => [relation.id, relation]));
      const requestedEnd = parsedEndDate;
      const requestedQuarter = quarterForEndDate(requestedEnd);
      const sourceQuarter = quarterForEndDate(source.endDate);
      const selected = requested.map(({ id }) => sourceById.get(id));
      const actualSelections: Array<{ id: string; partnerId: string }> = [];
      for (const [index, relation] of selected.entries()) {
        const suppliedPartnerId = requested[index]!.partnerId;
        if (!relation) throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
        if (suppliedPartnerId && relation.partnerId !== suppliedPartnerId) throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
        actualSelections.push({ id: relation.id, partnerId: relation.partnerId });
      }
      if (actor.role === "KAM" && !source.partners.some(({ partnerId }) => assigned.has(partnerId))) return null;
      if (actor.role === "KAM" && actualSelections.some(({ partnerId }) => !assigned.has(partnerId))) {
        throw new ScopedProlongationConflictError("Selected partner participation is unavailable; refresh the workspace");
      }
      if (actor.role === "KAM" && toUtcCalendarDate(requestTime) > source.endDate) {
        throw new ScopedProlongationConflictError("Promo is no longer eligible for prolongation");
      }
      if (requestedEnd <= source.endDate) throw new InvalidScopedProlongationError("endDate must be later than the current endDate");
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
      const snapshots: AssociationSnapshot[] = selectedRelations.map((relation) => ({
        id: relation.id,
        partnerId: relation.partnerId,
        rawEmailSubject: relation.rawEmailSubject,
        reportReceived: relation.reportReceived,
        reportReceivedAt: relation.reportReceivedAt,
        firstReminderSentAt: relation.firstReminderSentAt,
        secondReminderSentAt: relation.secondReminderSentAt,
        createdAt: relation.createdAt,
        updatedAt: relation.updatedAt,
      }));

      if (sameQuarter) {
        const existingTarget = await tx.promo.findUnique({
          where: { lob_normalizedName_startDate_endDate: { lob: source.lob, normalizedName: source.normalizedName, startDate: source.startDate, endDate: newEndDate } },
        });
        if (allActualSelected && !existingTarget) {
          await tx.promo.update({ where: { id: source.id }, data: { endDate: newEndDate, prolongedAt: requestTime } });
          const result = { kind: "extended", refreshRequired: true } as const;
          await recordOperation(tx, { sourcePromoId: source.id, sourceLob: source.lob, sourceEndDate: source.endDate, requestedEndDate: requestedEnd, result, targetPromoId: source.id, operationTime: requestTime, snapshots });
          return result;
        }
        const target = await findOrCreateTarget(tx, source, { lob: source.lob, normalizedName: source.normalizedName, startDate: source.startDate, endDate: newEndDate }, requestTime);
        await moveSelectionsToTarget(tx, source.id, target.id, actualSelections);
        if (!await tx.promoPartner.count({ where: { promoId: source.id } })) {
          await assertReportingPeriodOpen(source, tx);
          await tx.promo.delete({ where: { id: source.id } });
        }
        const result = { kind: "extended", refreshRequired: true } as const;
        await recordOperation(tx, { sourcePromoId: source.id, sourceLob: source.lob, sourceEndDate: source.endDate, requestedEndDate: requestedEnd, result, targetPromoId: target.id, operationTime: requestTime, snapshots });
        return result;
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
        const continuation = await tx.promo.findUniqueOrThrow({ where: { lob_normalizedName_startDate_endDate: continuationIdentity } });
        const result = { kind: "split", refreshRequired: true } as const;
        await recordOperation(tx, { sourcePromoId: source.id, sourceLob: source.lob, sourceEndDate: source.endDate, requestedEndDate: requestedEnd, result, targetPromoId: source.id, continuationPromoId: continuation.id, operationTime: requestTime, snapshots });
        return result;
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
      const result = { kind: "split", refreshRequired: true } as const;
      await recordOperation(tx, { sourcePromoId: source.id, sourceLob: source.lob, sourceEndDate: source.endDate, requestedEndDate: requestedEnd, result, targetPromoId: currentTarget.id, continuationPromoId: continuationTarget.id, operationTime: requestTime, snapshots });
      return result;
    }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const completed = await withSqliteBusyRetry(() => defaultTransactionRunner((tx) => findCompletedOperation(tx, promoId, requested, parsedEndDate, userId)));
      if (completed) return completed;
      throw new ScopedProlongationConflictError("Concurrent target conflict; refresh the workspace");
    }
    throw error;
  }
}
