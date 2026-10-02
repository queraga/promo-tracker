import type { User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import {
  InvalidScopedProlongationError,
  prolongAssignedPromoPartners,
  ScopedProlongationConflictError,
  withSqliteBusyRetry,
} from "../src/features/promoProlongation/prolongAssignedPromoPartners.js";
import { prisma } from "../src/shared/db/prisma.js";

const secret = "test-secret-that-is-at-least-32-characters";
const now = new Date("2026-09-28T17:30:00Z");
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const auth = (user: User) => ({ Cookie: `${AUTH_COOKIE}=${signAuthToken(user, secret)}` });

beforeEach(async () => {
  await prisma.reportingPeriod.deleteMany();
  await prisma.userPartner.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

async function fixture() {
  const [admin, plm, kamA, kamB] = await Promise.all([
    prisma.user.create({ data: { email: "admin@m113.test", passwordHash: "hash", role: "SUPERUSER" } }),
    prisma.user.create({ data: { email: "plm@m113.test", passwordHash: "hash", role: "PLM" } }),
    prisma.user.create({ data: { email: "a@m113.test", passwordHash: "hash", role: "KAM" } }),
    prisma.user.create({ data: { email: "b@m113.test", passwordHash: "hash", role: "KAM" } }),
  ]);
  const [rozetka, comfy, allo, citrus] = await Promise.all([
    prisma.partner.create({ data: { id: "m113-rozetka", name: "Rozetka" } }),
    prisma.partner.create({ data: { id: "m113-comfy", name: "Comfy" } }),
    prisma.partner.create({ data: { id: "m113-allo", name: "ALLO" } }),
    prisma.partner.create({ data: { id: "m113-citrus", name: "Citrus" } }),
  ]);
  await prisma.userPartner.createMany({ data: [
    { userId: kamA.id, partnerId: rozetka.id }, { userId: kamA.id, partnerId: comfy.id },
    { userId: kamB.id, partnerId: allo.id }, { userId: kamB.id, partnerId: citrus.id },
  ] });
  const promo = await prisma.promo.create({ data: {
    id: "m113-source", lob: "iPhone", name: "September Promo", normalizedName: "september promo",
    startDate: date("2026-09-03"), endDate: date("2026-09-28"),
    partners: { create: [
      { id: "rel-rozetka", partnerId: rozetka.id, rawEmailSubject: "source", reportReceived: true, reportReceivedAt: date("2026-09-20"), firstReminderSentAt: date("2026-09-21"), secondReminderSentAt: date("2026-09-22") },
      { id: "rel-comfy", partnerId: comfy.id }, { id: "rel-allo", partnerId: allo.id }, { id: "rel-citrus", partnerId: citrus.id },
    ] },
  } });
  return { admin, plm, kamA, kamB, promo, rozetka, comfy, allo, citrus };
}

const graph = async () => (await prisma.promo.findMany({ include: { partners: true } })).map((promo) => ({
  identity: [promo.lob, promo.normalizedName, promo.startDate.toISOString(), promo.endDate.toISOString()].join("|"),
  partners: promo.partners.map(({ partnerId }) => partnerId).sort(),
})).sort((a, b) => a.identity.localeCompare(b.identity));

describe("M11.3a scoped prolongation domain", () => {
  it("moves one same-quarter relation and preserves its complete lifecycle", async () => {
    const { promo, kamA, rozetka } = await fixture();
    const before = await prisma.promoPartner.findUniqueOrThrow({ where: { id: "rel-rozetka" } });
    await expect(prolongAssignedPromoPartners(promo.id, [before.id], "2026-09-30", kamA.id, now)).resolves.toEqual({ kind: "extended", refreshRequired: true });
    const moved = await prisma.promoPartner.findUniqueOrThrow({ where: { id: before.id }, include: { promo: true } });
    expect(moved).toMatchObject({ id: before.id, partnerId: rozetka.id, rawEmailSubject: before.rawEmailSubject, reportReceived: true, reportReceivedAt: before.reportReceivedAt, firstReminderSentAt: before.firstReminderSentAt, secondReminderSentAt: before.secondReminderSentAt });
    expect(moved.promo).toMatchObject({ endDate: date("2026-09-30"), prolongedAt: now, name: "September Promo" });
    expect(await prisma.promoPartner.count({ where: { promoId: promo.id } })).toBe(3);
  });

  it("moves several visible relations while preserving hidden source relations", async () => {
    const { promo, kamA } = await fixture();
    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka", "rel-comfy"], "2026-09-30", kamA.id, now);
    expect((await prisma.promoPartner.findMany({ where: { promoId: promo.id }, select: { id: true } })).map(({ id }) => id).sort()).toEqual(["rel-allo", "rel-citrus"]);
  });

  it("uses whole-Promo semantics for all actual relations and deletes no source identity", async () => {
    const { promo, kamA, kamB } = await fixture();
    await prisma.userPartner.createMany({ data: [{ userId: kamA.id, partnerId: "m113-allo" }, { userId: kamA.id, partnerId: "m113-citrus" }] });
    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka", "rel-comfy", "rel-allo", "rel-citrus"], "2026-09-30", kamA.id, now);
    expect(await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ endDate: date("2026-09-30"), prolongedAt: now });
    expect(await prisma.promo.count()).toBe(1);
    expect(kamB.id).toBeGreaterThan(0);
  });

  it("splits cross-quarter, preserves current relations and creates clean continuation state", async () => {
    const { promo, kamA } = await fixture();
    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka", "rel-comfy"], "2026-10-12", kamA.id, now);
    const current = await prisma.promo.findUniqueOrThrow({ where: { lob_normalizedName_startDate_endDate: { lob: promo.lob, normalizedName: promo.normalizedName, startDate: promo.startDate, endDate: date("2026-09-30") } }, include: { partners: true } });
    expect(current.partners.map(({ id }) => id).sort()).toEqual(["rel-comfy", "rel-rozetka"]);
    expect(current.prolongedAt).toEqual(now);
    const continuation = await prisma.promo.findUniqueOrThrow({ where: { lob_normalizedName_startDate_endDate: { lob: promo.lob, normalizedName: promo.normalizedName, startDate: date("2026-10-01"), endDate: date("2026-10-12") } }, include: { partners: true } });
    expect(continuation.prolongedAt).toEqual(now);
    for (const relation of continuation.partners) expect(relation).toMatchObject({ rawEmailSubject: null, reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null });
    expect(await prisma.promoPartner.findUniqueOrThrow({ where: { id: "rel-rozetka" } })).toMatchObject({ promoId: current.id, reportReceived: true });
  });

  it("marks a partial-selection source when it is already the current-quarter segment", async () => {
    const { promo, kamA } = await fixture();
    await prisma.promoPartner.delete({ where: { id: "rel-citrus" } });
    await prisma.promo.update({ where: { id: promo.id }, data: { endDate: date("2026-09-30") } });
    const before = await prisma.promoPartner.findUniqueOrThrow({ where: { id: "rel-rozetka" } });

    await prolongAssignedPromoPartners(promo.id, [before.id], "2026-10-12", kamA.id, now);

    const current = await prisma.promo.findUniqueOrThrow({ where: { id: promo.id }, include: { partners: true } });
    expect(current).toMatchObject({ startDate: date("2026-09-03"), endDate: date("2026-09-30"), prolongedAt: now });
    expect(current.partners.map(({ id }) => id).sort()).toEqual(["rel-allo", "rel-comfy", "rel-rozetka"]);
    expect(current.partners.find(({ id }) => id === before.id)).toMatchObject({
      id: before.id,
      promoId: promo.id,
      rawEmailSubject: before.rawEmailSubject,
      reportReceived: before.reportReceived,
      reportReceivedAt: before.reportReceivedAt,
      firstReminderSentAt: before.firstReminderSentAt,
      secondReminderSentAt: before.secondReminderSentAt,
    });

    const continuation = await prisma.promo.findUniqueOrThrow({
      where: { lob_normalizedName_startDate_endDate: { lob: promo.lob, normalizedName: promo.normalizedName, startDate: date("2026-10-01"), endDate: date("2026-10-12") } },
      include: { partners: true },
    });
    expect(continuation.prolongedAt).toEqual(now);
    expect(continuation.partners).toHaveLength(1);
    expect(continuation.partners[0]).toMatchObject({
      partnerId: "m113-rozetka",
      rawEmailSubject: null,
      reportReceived: false,
      reportReceivedAt: null,
      firstReminderSentAt: null,
      secondReminderSentAt: null,
    });
    expect(continuation.partners[0].id).not.toBe(before.id);
  });

  it("does not decrease a later marker on the source/current-quarter segment", async () => {
    const { promo, kamA } = await fixture();
    await prisma.promoPartner.delete({ where: { id: "rel-citrus" } });
    await prisma.promo.update({ where: { id: promo.id }, data: { endDate: date("2026-09-30"), prolongedAt: new Date("2026-09-29T18:00:00Z") } });

    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-10-12", kamA.id, now);

    expect(await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ prolongedAt: new Date("2026-09-29T18:00:00Z") });
  });

  it("leaves a distinct partial source marker unchanged while marking both split targets", async () => {
    const { promo, kamA } = await fixture();
    const previousMarker = new Date("2026-09-27T12:00:00Z");
    await prisma.promo.update({ where: { id: promo.id }, data: { prolongedAt: previousMarker } });

    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-10-12", kamA.id, now);

    expect(await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ endDate: date("2026-09-28"), prolongedAt: previousMarker });
    const currentTarget = await prisma.promo.findUniqueOrThrow({
      where: { lob_normalizedName_startDate_endDate: { lob: promo.lob, normalizedName: promo.normalizedName, startDate: promo.startDate, endDate: date("2026-09-30") } },
    });
    const continuation = await prisma.promo.findUniqueOrThrow({
      where: { lob_normalizedName_startDate_endDate: { lob: promo.lob, normalizedName: promo.normalizedName, startDate: date("2026-10-01"), endDate: date("2026-10-12") } },
    });
    expect(currentTarget.prolongedAt).toEqual(now);
    expect(continuation.prolongedAt).toEqual(now);
  });

  it("consolidates sequential actions independent of KAM order", async () => {
    const first = await fixture();
    await prolongAssignedPromoPartners(first.promo.id, ["rel-rozetka", "rel-comfy"], "2026-10-12", first.kamA.id, now);
    await prolongAssignedPromoPartners(first.promo.id, ["rel-allo", "rel-citrus"], "2026-10-12", first.kamB.id, new Date("2026-09-28T18:00:00Z"));
    const aThenB = await graph();
    expect(await prisma.promo.findUnique({ where: { id: first.promo.id } })).toBeNull();
    await prisma.reportingPeriod.deleteMany(); await prisma.userPartner.deleteMany(); await prisma.user.deleteMany(); await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
    const second = await fixture();
    await prolongAssignedPromoPartners(second.promo.id, ["rel-allo", "rel-citrus"], "2026-10-12", second.kamB.id, now);
    await prolongAssignedPromoPartners(second.promo.id, ["rel-rozetka", "rel-comfy"], "2026-10-12", second.kamA.id, new Date("2026-09-28T18:00:00Z"));
    expect(await graph()).toEqual(aThenB);
    expect((await graph()).map(({ partners }) => partners)).toEqual([
      ["m113-allo", "m113-citrus", "m113-comfy", "m113-rozetka"],
      ["m113-allo", "m113-citrus", "m113-comfy", "m113-rozetka"],
    ]);
  });

  it("does not merge different dates, normalized names or LOBs", async () => {
    const { promo, kamA } = await fixture();
    await Promise.all([
      prisma.promo.create({ data: { lob: promo.lob, name: promo.name, normalizedName: promo.normalizedName, startDate: promo.startDate, endDate: date("2026-09-29") } }),
      prisma.promo.create({ data: { lob: promo.lob, name: "Other", normalizedName: "other", startDate: promo.startDate, endDate: date("2026-09-30") } }),
      prisma.promo.create({ data: { lob: "Mac", name: promo.name, normalizedName: promo.normalizedName, startDate: promo.startDate, endDate: date("2026-09-30") } }),
    ]);
    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-09-30", kamA.id, now);
    expect(await prisma.promo.count()).toBe(5);
  });

  it("rejects unauthorized, foreign, stale and zero-assignment selections atomically", async () => {
    const { promo, kamA } = await fixture();
    const zero = await prisma.user.create({ data: { email: "zero@m113.test", passwordHash: "hash", role: "KAM" } });
    const other = await prisma.promo.create({ data: { lob: "Mac", name: "Other", normalizedName: "other", startDate: date("2026-09-01"), endDate: date("2026-09-28"), partners: { create: { id: "foreign-rel", partnerId: "m113-rozetka" } } } });
    for (const [userId, ids] of [[kamA.id, ["rel-rozetka", "rel-allo"]], [kamA.id, ["foreign-rel"]], [kamA.id, ["missing-rel"]]] as Array<[number, string[]]>) {
      await expect(prolongAssignedPromoPartners(promo.id, ids, "2026-09-30", userId, now)).rejects.toBeInstanceOf(ScopedProlongationConflictError);
    }
    await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-09-30", zero.id, now)).resolves.toBeNull();
    expect(await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ endDate: date("2026-09-28") });
    expect(await prisma.promoPartner.count({ where: { promoId: promo.id } })).toBe(4);
    expect(other.id).toBeTruthy();
  });

  it("rejects malformed selections, ended promos and non-adjacent dates", async () => {
    const { promo, kamA } = await fixture();
    for (const ids of [[], ["rel-rozetka", "rel-rozetka"]]) await expect(prolongAssignedPromoPartners(promo.id, ids, "2026-09-30", kamA.id, now)).rejects.toBeInstanceOf(InvalidScopedProlongationError);
    for (const end of ["2026-09-28", "2026-09-27", "2027-01-01", "bad-date"]) await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], end, kamA.id, now)).rejects.toBeInstanceOf(InvalidScopedProlongationError);
    await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-09-30", kamA.id, date("2026-09-29"))).rejects.toBeInstanceOf(ScopedProlongationConflictError);
    await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-09-30", kamA.id, date("2026-09-28"))).resolves.toBeTruthy();
  });

  it("rejects target partner conflicts without changing either history", async () => {
    const { promo, kamA } = await fixture();
    const target = await prisma.promo.create({ data: { lob: promo.lob, name: "Preserved target name", normalizedName: promo.normalizedName, startDate: promo.startDate, endDate: date("2026-09-30"), partners: { create: { id: "target-rozetka", partnerId: "m113-rozetka", reportReceived: false } } } });
    await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-09-30", kamA.id, now)).rejects.toBeInstanceOf(ScopedProlongationConflictError);
    expect(await prisma.promoPartner.count({ where: { partnerId: "m113-rozetka" } })).toBe(2);
    expect((await prisma.promo.findUniqueOrThrow({ where: { id: target.id } })).name).toBe("Preserved target name");
  });

  it("preserves an existing compatible target name and the later prolonged timestamp", async () => {
    const { promo, kamA } = await fixture();
    const later = new Date("2026-09-29T10:00:00Z");
    const target = await prisma.promo.create({ data: { lob: promo.lob, name: "Canonical target display", normalizedName: promo.normalizedName, startDate: promo.startDate, endDate: date("2026-09-30"), prolongedAt: later } });
    await prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-09-30", kamA.id, now);
    expect(await prisma.promo.findUniqueOrThrow({ where: { id: target.id } })).toMatchObject({ name: "Canonical target display", prolongedAt: later });
  });

  it("protects CLOSED source, current-segment and continuation periods", async () => {
    for (const quarter of [3, 4]) {
      const { promo, kamA, admin } = await fixture();
      await prisma.reportingPeriod.create({ data: { year: 2026, quarter, lob: promo.lob, status: "CLOSED", closedByUserId: admin.id, closedAt: now } });
      await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2026-10-12", kamA.id, now)).rejects.toThrow("Reporting period is closed");
      expect(await prisma.promoPartner.count({ where: { promoId: promo.id } })).toBe(4);
      await prisma.reportingPeriod.deleteMany(); await prisma.userPartner.deleteMany(); await prisma.user.deleteMany(); await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
    }
  });

  it("supports Q4 to Q1 and removes an emptied source", async () => {
    const { promo, kamA } = await fixture();
    await prisma.promoPartner.deleteMany({ where: { id: { not: "rel-rozetka" } } });
    await prisma.promo.update({ where: { id: promo.id }, data: { startDate: date("2026-12-01"), endDate: date("2026-12-28") } });
    await expect(prolongAssignedPromoPartners(promo.id, ["rel-rozetka"], "2027-01-12", kamA.id, date("2026-12-28"))).resolves.toMatchObject({ kind: "split" });
    expect(await prisma.promo.count()).toBe(2);
    expect(await prisma.promo.findUnique({ where: { id: promo.id } })).not.toBeNull();
  });

  it("retries recognized SQLite contention around the complete operation only", async () => {
    const operation = vi.fn().mockRejectedValueOnce(Object.assign(new Error("database is locked"), { code: "SQLITE_BUSY" })).mockResolvedValue("ok");
    await expect(withSqliteBusyRetry(operation)).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(2);
    const domainFailure = vi.fn().mockRejectedValue(new ScopedProlongationConflictError("conflict"));
    await expect(withSqliteBusyRetry(domainFailure)).rejects.toBeInstanceOf(ScopedProlongationConflictError);
    expect(domainFailure).toHaveBeenCalledTimes(1);
  });
});

describe("M11.3a scoped prolongation API", () => {
  const api = () => request(createApi({ jwtSecret: secret, now: () => now }));

  it("returns minimal same- and cross-quarter success responses without hidden partner data", async () => {
    const first = await fixture();
    const same = await api().post(`/api/promos/${first.promo.id}/prolong-partners`).set(auth(first.kamA)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" });
    expect(same.status).toBe(200); expect(same.body).toEqual({ kind: "extended", refreshRequired: true }); expect(JSON.stringify(same.body)).not.toContain("Citrus");
    await prisma.reportingPeriod.deleteMany(); await prisma.userPartner.deleteMany(); await prisma.user.deleteMany(); await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
    const second = await fixture();
    const split = await api().post(`/api/promos/${second.promo.id}/prolong-partners`).set(auth(second.kamA)).send({ promoPartnerIds: ["rel-rozetka", "rel-comfy"], endDate: "2026-10-12" });
    expect(split.status).toBe(201); expect(split.body).toEqual({ kind: "split", refreshRequired: true });
  });

  it("keeps PLM and SUPERUSER off the scoped endpoint while preserving existing SUPERUSER M11", async () => {
    const { promo, admin, plm } = await fixture();
    for (const user of [admin, plm]) expect((await api().post(`/api/promos/${promo.id}/prolong-partners`).set(auth(user)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(403);
    expect((await api().post(`/api/promos/${promo.id}/prolong`).set(auth(admin)).send({ endDate: "2026-09-30" })).status).toBe(200);
  });

  it("maps malformed, unavailable, stale and ended requests without leaking relation details", async () => {
    const { promo, kamA } = await fixture();
    for (const body of [{}, { promoPartnerIds: [], endDate: "2026-09-30" }, { promoPartnerIds: ["rel-rozetka", "rel-rozetka"], endDate: "2026-09-30" }, { promoPartnerIds: ["rel-rozetka"], endDate: "bad" }]) {
      expect((await api().post(`/api/promos/${promo.id}/prolong-partners`).set(auth(kamA)).send(body)).status).toBe(400);
    }
    const unavailable = await api().post(`/api/promos/${promo.id}/prolong-partners`).set(auth(kamA)).send({ promoPartnerIds: ["rel-allo"], endDate: "2026-09-30" });
    expect(unavailable.status).toBe(409); expect(JSON.stringify(unavailable.body)).not.toContain("ALLO");
    const zero = await prisma.user.create({ data: { email: "api-zero@m113.test", passwordHash: "hash", role: "KAM" } });
    expect((await api().post(`/api/promos/${promo.id}/prolong-partners`).set(auth(zero)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(404);
    expect((await api().post("/api/promos/missing/prolong-partners").set(auth(kamA)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(404);
    expect((await api().post(`/api/promos/${promo.id}/prolong-partners`).set(auth(kamA)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(200);
    expect((await api().post(`/api/promos/${promo.id}/prolong-partners`).set(auth(kamA)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(409);
    const endedApi = request(createApi({ jwtSecret: secret, now: () => date("2026-09-29") }));
    expect((await endedApi.post(`/api/promos/${promo.id}/prolong-partners`).set(auth(kamA)).send({ promoPartnerIds: ["rel-comfy"], endDate: "2026-09-30" })).status).toBe(409);
  });

  it("maps CLOSED and compatible-target partner conflicts to 409", async () => {
    const first = await fixture();
    await prisma.reportingPeriod.create({ data: { year: 2026, quarter: 3, lob: first.promo.lob, status: "CLOSED", closedAt: now, closedByUserId: first.admin.id } });
    expect((await api().post(`/api/promos/${first.promo.id}/prolong-partners`).set(auth(first.kamA)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(409);
    await prisma.reportingPeriod.deleteMany(); await prisma.userPartner.deleteMany(); await prisma.user.deleteMany(); await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
    const second = await fixture();
    await prisma.promo.create({ data: { lob: second.promo.lob, name: second.promo.name, normalizedName: second.promo.normalizedName, startDate: second.promo.startDate, endDate: date("2026-09-30"), partners: { create: { partnerId: second.rozetka.id } } } });
    expect((await api().post(`/api/promos/${second.promo.id}/prolong-partners`).set(auth(second.kamA)).send({ promoPartnerIds: ["rel-rozetka"], endDate: "2026-09-30" })).status).toBe(409);
  });
});
