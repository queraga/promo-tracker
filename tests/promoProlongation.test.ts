import type { User } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import { InvalidProlongationError, prolongPromo } from "../src/features/promoProlongation/prolongPromo.js";
import { createPromoFromParsedSubject } from "../src/features/createPromo/createPromoFromParsedSubject.js";
import { parsePromoSubject } from "../src/features/parsePromoSubject/parsePromoSubject.js";
import { quarterForEndDate } from "../src/features/quarterlyReporting/quarter.js";
import { closeReportingPeriod, getArchivedPeriod } from "../src/features/quarterlyReporting/quarterlyReporting.js";
import { prisma } from "../src/shared/db/prisma.js";

const secret = "test-secret-that-is-at-least-32-characters";
const operationTime = new Date("2026-09-30T09:30:00Z");
const date = (value: string) => new Date(`${value}T00:00:00Z`);
const auth = (user: User) => ({ Cookie: `${AUTH_COOKIE}=${signAuthToken(user, secret)}` });
const api = () => request(createApi({ jwtSecret: secret, now: () => operationTime }));

beforeEach(async () => {
  await prisma.reportingPeriod.deleteMany(); await prisma.userPartner.deleteMany(); await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
});
afterEach(async () => { await prisma.reportingPeriod.deleteMany(); });

async function fixture() {
  const [admin, plm, kam] = await Promise.all([
    prisma.user.create({ data: { email: "admin@m11.test", passwordHash: "hash", role: "SUPERUSER" } }),
    prisma.user.create({ data: { email: "plm@m11.test", passwordHash: "hash", role: "PLM" } }),
    prisma.user.create({ data: { email: "kam@m11.test", passwordHash: "hash", role: "KAM" } }),
  ]);
  const [rozetka, citrus] = await Promise.all([
    prisma.partner.create({ data: { id: "rozetka-m11", name: "Rozetka" } }),
    prisma.partner.create({ data: { id: "citrus-m11", name: "Citrus" } }),
  ]);
  await prisma.userPartner.create({ data: { userId: kam.id, partnerId: rozetka.id } });
  const promo = await prisma.promo.create({ data: {
    id: "promo-m11", lob: "AW", name: "October Apple Watch", normalizedName: "october apple watch",
    startDate: date("2026-09-03"), endDate: date("2026-09-28"),
    partners: { create: [
      { id: "old-rozetka", partnerId: rozetka.id, rawEmailSubject: "original source", reportReceived: true, reportReceivedAt: date("2026-09-29"), firstReminderSentAt: date("2026-09-29"), secondReminderSentAt: date("2026-09-30") },
      { id: "old-citrus", partnerId: citrus.id, rawEmailSubject: "second source" },
    ] },
  }, include: { partners: { include: { partner: true } } } });
  return { admin, plm, kam, rozetka, citrus, promo };
}

describe("M11 promo prolongation", () => {
  it("extends a same-quarter Promo in place and preserves its complete partner lifecycle", async () => {
    const { promo } = await fixture();
    const beforeRelations = await prisma.promoPartner.findMany({ where: { promoId: promo.id }, orderBy: { id: "asc" } });
    await prolongPromo(promo.id, "2026-09-29", new Date("2026-09-29T09:00:00Z"));
    const result = await prolongPromo(promo.id, "2026-09-30", operationTime);
    expect(result?.kind).toBe("extended");
    if (!result || result.kind !== "extended") throw new Error("expected extended result");
    expect(result.promo).toMatchObject({ id: promo.id, lob: "AW", name: "October Apple Watch", normalizedName: "october apple watch", startDate: date("2026-09-03"), endDate: date("2026-09-30"), prolongedAt: operationTime });
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.findMany({ where: { promoId: promo.id }, orderBy: { id: "asc" } })).toEqual(beforeRelations);
  });

  it("splits only an explicit cross-quarter prolongation and resets every continuation relation", async () => {
    const { promo, rozetka, citrus } = await fixture();
    const oldRelations = await prisma.promoPartner.findMany({ where: { promoId: promo.id }, orderBy: { id: "asc" } });
    const result = await prolongPromo(promo.id, "2026-10-12", operationTime);
    expect(result?.kind).toBe("split");
    if (!result || result.kind !== "split") throw new Error("expected split result");
    expect(result.currentPromo).toMatchObject({ id: promo.id, startDate: date("2026-09-03"), endDate: date("2026-09-30"), prolongedAt: operationTime });
    expect(result.continuationPromo).toMatchObject({ lob: "AW", name: "October Apple Watch", normalizedName: "october apple watch", startDate: date("2026-10-01"), endDate: date("2026-10-12"), prolongedAt: operationTime });
    expect(result.currentPromo.prolongedAt).toEqual(result.continuationPromo.prolongedAt);
    expect(result.continuationPromo.partners.map(({ partnerId }) => partnerId).sort()).toEqual([citrus.id, rozetka.id].sort());
    expect(result.continuationPromo.partners).toHaveLength(2);
    for (const relation of result.continuationPromo.partners) expect(relation).toMatchObject({ rawEmailSubject: null, reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null });
    expect(await prisma.promoPartner.findMany({ where: { promoId: promo.id }, orderBy: { id: "asc" } })).toEqual(oldRelations);
  });

  it("preserves partner-specific FSM identity through SUPERUSER whole-Promo prolongation", async () => {
    await fixture();
    const created = await createPromoFromParsedSubject(parsePromoSubject("FSM Comfy iPhone 09.09-28.09", operationTime));
    const result = await prolongPromo(created.promo.id, "2026-10-12", operationTime);
    expect(result?.kind).toBe("split");
    if (!result || result.kind !== "split") throw new Error("expected split result");
    expect(result.currentPromo.normalizedName).toBe(created.promo.normalizedName);
    expect(result.continuationPromo.normalizedName).toBe(created.promo.normalizedName);
    expect(result.continuationPromo.name).toContain("FSM");
    expect(result.continuationPromo.partners.map(({ partner }) => partner.name)).toEqual(["Comfy"]);
  });

  it("rolls back the current Promo when continuation creation fails", async () => {
    const { promo } = await fixture();
    await prisma.promo.create({ data: { lob: promo.lob, name: promo.name, normalizedName: promo.normalizedName, startDate: date("2026-10-01"), endDate: date("2026-10-12") } });
    await expect(prolongPromo(promo.id, "2026-10-12", operationTime)).rejects.toMatchObject({ code: "P2002" });
    expect(await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ endDate: date("2026-09-28"), prolongedAt: null });
  });

  it("rejects equal, earlier and non-adjacent-quarter end dates", async () => {
    const { promo } = await fixture();
    for (const endDate of ["2026-09-28", "2026-09-27", "2027-01-15", "not-a-date"]) {
      await expect(prolongPromo(promo.id, endDate, operationTime)).rejects.toBeInstanceOf(InvalidProlongationError);
    }
    expect(await prisma.promo.findUniqueOrThrow({ where: { id: promo.id } })).toMatchObject({ endDate: date("2026-09-28"), prolongedAt: null });
  });

  it("preserves CLOSED history for every role and rejects a closed target quarter", async () => {
    const { promo, admin } = await fixture();
    await prisma.reportingPeriod.create({ data: { year: 2026, quarter: 3, lob: promo.lob, status: "CLOSED", closedAt: operationTime, closedByUserId: admin.id } });
    await expect(prolongPromo(promo.id, "2026-10-12", operationTime)).rejects.toThrow("Reporting period is closed");
    expect((await api().post(`/api/promos/${promo.id}/prolong`).set(auth(admin)).send({ endDate: "2026-10-12" })).status).toBe(409);
    await prisma.reportingPeriod.deleteMany();
    await prisma.reportingPeriod.create({ data: { year: 2026, quarter: 4, lob: promo.lob, status: "CLOSED", closedAt: operationTime, closedByUserId: admin.id } });
    await expect(prolongPromo(promo.id, "2026-10-12", operationTime)).rejects.toThrow("Reporting period is closed");
  });

  it("allows only SUPERUSER and preserves non-leaking API behavior", async () => {
    const { promo, admin, plm, kam } = await fixture();
    expect((await api().post(`/api/promos/${promo.id}/prolong`).set(auth(plm)).send({ endDate: "2026-09-30" })).status).toBe(403);
    expect((await api().post(`/api/promos/${promo.id}/prolong`).set(auth(kam)).send({ endDate: "2026-09-30" })).status).toBe(403);
    expect((await api().post("/api/promos/missing/prolong").set(auth(admin)).send({ endDate: "2026-09-30" })).status).toBe(404);
    expect(await prisma.promo.count()).toBe(1);
  });

  it("returns explicit API outcomes and serialized prolongedAt values", async () => {
    const { promo, admin } = await fixture();
    const same = await api().post(`/api/promos/${promo.id}/prolong`).set(auth(admin)).send({ endDate: "2026-09-30" });
    expect(same.status).toBe(200);
    expect(same.body).toMatchObject({ kind: "extended", promo: { id: promo.id, endDate: "2026-09-30T00:00:00.000Z", prolongedAt: operationTime.toISOString() } });
    const split = await api().post(`/api/promos/${promo.id}/prolong`).set(auth(admin)).send({ endDate: "2026-10-12" });
    expect(split.status).toBe(201);
    expect(split.body).toMatchObject({ kind: "split", currentPromo: { endDate: "2026-09-30T00:00:00.000Z", prolongedAt: operationTime.toISOString() }, continuationPromo: { startDate: "2026-10-01T00:00:00.000Z", endDate: "2026-10-12T00:00:00.000Z", prolongedAt: operationTime.toISOString() } });
  });

  it("keeps an ordinary cross-quarter Promo unsplit, unmarked and assigned to Q4 by endDate", async () => {
    await fixture();
    const ordinary = await prisma.promo.create({ data: { id: "ordinary-cross", lob: "iPhone", name: "Ordinary", normalizedName: "ordinary", startDate: date("2026-09-25"), endDate: date("2026-10-04") } });
    expect(await prisma.promo.count({ where: { id: ordinary.id } })).toBe(1);
    expect(ordinary.prolongedAt).toBeNull();
    expect(quarterForEndDate(ordinary.endDate)).toEqual({ year: 2026, quarter: 4 });
  });

  it("preserves the prolongation marker through normal M10 closure and archive reads", async () => {
    const { promo, admin } = await fixture();
    await prolongPromo(promo.id, "2026-10-12", operationTime);
    await prisma.promoPartner.updateMany({ where: { promoId: promo.id }, data: { reportReceived: true, reportReceivedAt: operationTime } });
    await closeReportingPeriod(2026, 3, promo.lob, admin.id, operationTime);
    const period = await prisma.reportingPeriod.findUniqueOrThrow({ where: { year_quarter_lob: { year: 2026, quarter: 3, lob: promo.lob } } });
    const archived = await getArchivedPeriod(period.id);
    expect(archived?.promos).toHaveLength(1);
    expect(archived?.promos[0]).toMatchObject({ id: promo.id, endDate: date("2026-09-30"), prolongedAt: operationTime });
  });
});
