import type { User } from "@prisma/client";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import { prisma } from "../src/shared/db/prisma.js";
import { createPromoFromParsedSubject } from "../src/features/createPromo/createPromoFromParsedSubject.js";
import { ClosedReportingPeriodError } from "../src/features/quarterlyReporting/closedPeriods.js";
import { getReportReminderCandidates, markFirstReminderSent } from "../src/features/reportReminders/reminderRepository.js";

const secret = "test-secret-that-is-at-least-32-characters";
const now = new Date("2026-10-10T12:00:00Z");
const auth = (user: User) => ({ Cookie: `${AUTH_COOKIE}=${signAuthToken(user, secret)}` });
const api = () => request(createApi({ jwtSecret: secret, now: () => now }));

beforeEach(async () => {
  await prisma.reportingPeriod.deleteMany(); await prisma.userPartner.deleteMany(); await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
});
afterEach(async () => { await prisma.reportingPeriod.deleteMany(); });

async function dataset() {
  const [plm, admin, kam] = await Promise.all([
    prisma.user.create({ data: { email: "plm@quarter.test", passwordHash: "hash", role: "PLM" } }),
    prisma.user.create({ data: { email: "admin@quarter.test", passwordHash: "hash", role: "SUPERUSER" } }),
    prisma.user.create({ data: { email: "kam@quarter.test", passwordHash: "hash", role: "KAM" } }),
  ]);
  const [rozetka, citrus] = await Promise.all([
    prisma.partner.create({ data: { id: "rozetka", name: "Rozetka" } }), prisma.partner.create({ data: { id: "citrus", name: "Citrus" } }),
  ]);
  await prisma.userPartner.create({ data: { userId: kam.id, partnerId: rozetka.id } });
  const makePromo = (id: string, lob: string, start: string, end: string, partners: Array<{ id: string; received: boolean; receivedAt?: string }>) => prisma.promo.create({ data: {
    id, lob, name: `Promo ${id}`, normalizedName: `promo ${id}`, startDate: new Date(`${start}T00:00:00Z`), endDate: new Date(`${end}T00:00:00Z`),
    partners: { create: partners.map((p) => ({ id: `${id}-${p.id}`, partnerId: p.id, rawEmailSubject: id, reportReceived: p.received, reportReceivedAt: p.receivedAt ? new Date(p.receivedAt) : null })) },
  } });
  await Promise.all([
    makePromo("q3-a", "iPhone", "2026-07-10", "2026-07-20", [{ id: rozetka.id, received: true, receivedAt: "2026-10-07T00:00:00Z" }, { id: citrus.id, received: false }]),
    makePromo("q3-b", "iPhone", "2026-09-01", "2026-09-30", [{ id: rozetka.id, received: true }]),
    makePromo("q3-mac", "Mac", "2026-09-01", "2026-09-30", [{ id: citrus.id, received: true }]),
    makePromo("cross", "iPhone", "2026-09-29", "2026-10-05", [{ id: rozetka.id, received: true }]),
  ]);
  return { plm, admin, kam, rozetka, citrus };
}

describe("quarterly reporting API", () => {
  it("aggregates expected relations, partner progress and exact pending details by Promo.endDate", async () => {
    const { plm } = await dataset();
    const response = await api().get("/api/reporting/summary").query({ year: 2026, quarter: 3, lob: "iPhone" }).set(auth(plm));
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ year: 2026, quarter: 3, lob: "iPhone", status: "OPEN", promoCount: 2, expectedReports: 3, receivedReports: 2, pendingReports: 1, completionPercentage: 66.7, ready: false });
    expect(response.body.pending).toHaveLength(1);
    expect(response.body.pending[0]).toMatchObject({ promoId: "q3-a", partnerName: "Citrus" });
    expect(response.body.partners.map((p: { partnerName: string; receivedReports: number; expectedReports: number }) => [p.partnerName, p.receivedReports, p.expectedReports])).toEqual([["Citrus", 0, 1], ["Rozetka", 2, 2]]);
    expect(JSON.stringify(response.body)).not.toContain("cross");
  });

  it("does not use reportReceivedAt or startDate to determine the quarter", async () => {
    const { plm } = await dataset();
    const q3 = await api().get("/api/reporting/summary").query({ year: 2026, quarter: 3, lob: "iPhone" }).set(auth(plm));
    const q4 = await api().get("/api/reporting/summary").query({ year: 2026, quarter: 4, lob: "iPhone" }).set(auth(plm));
    expect(q3.body.expectedReports).toBe(3);
    expect(q3.body.receivedReports).toBe(2);
    expect(q4.body).toMatchObject({ promoCount: 1, expectedReports: 1, receivedReports: 1, ready: true });
  });

  it("aggregates the composite AW & AirPods LOB generically in Q4 by endDate", async () => {
    const { plm, citrus } = await dataset();
    await prisma.promo.create({ data: { id: "composite", lob: "AW & AirPods", name: "AirPods & Apple Watch", normalizedName: "airpods apple watch", startDate: new Date("2026-09-28T00:00:00Z"), endDate: new Date("2026-10-04T00:00:00Z"), partners: { create: { id: "composite-citrus", partnerId: citrus.id, reportReceived: false, rawEmailSubject: "composite" } } } });
    const response = await api().get("/api/reporting/summary").query({ year: 2026, quarter: 4, lob: "AW & AirPods" }).set(auth(plm));
    expect(response.body).toMatchObject({ year: 2026, quarter: 4, lob: "AW & AirPods", promoCount: 1, expectedReports: 1, receivedReports: 0, pendingReports: 1, ready: false });
    expect(response.body.pending[0]).toMatchObject({ promoId: "composite", partnerName: "Citrus" });
  });

  it("keeps zero-data periods OPEN and not ready", async () => {
    const { plm } = await dataset();
    const response = await api().get("/api/reporting/summary").query({ year: 2025, quarter: 1, lob: "iPhone" }).set(auth(plm));
    expect(response.body).toMatchObject({ expectedReports: 0, receivedReports: 0, pendingReports: 0, completionPercentage: 0, ready: false, status: "OPEN" });
  });

  it("allows PLM global reporting, SUPERUSER read-only reporting, and denies KAM", async () => {
    const { plm, admin, kam } = await dataset();
    for (const user of [plm, admin]) expect((await api().get("/api/reporting/summary").query({ year: 2026, quarter: 3, lob: "Mac" }).set(auth(user))).status).toBe(200);
    expect((await api().get("/api/reporting/summary").query({ year: 2026, quarter: 3, lob: "iPhone" }).set(auth(kam))).status).toBe(403);
    expect((await api().post("/api/reporting/close").set(auth(admin)).send({ year: 2026, quarter: 3, lob: "Mac" })).status).toBe(403);
    expect((await api().post("/api/reporting/close").set(auth(kam)).send({ year: 2026, quarter: 3, lob: "Mac" })).status).toBe(403);
  });

  it("rejects pending and empty periods, then atomically closes a ready period with actor and timestamp", async () => {
    const { plm } = await dataset();
    expect((await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2026, quarter: 3, lob: "iPhone" })).status).toBe(409);
    expect((await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2025, quarter: 1, lob: "iPhone" })).status).toBe(409);
    expect(await prisma.reportingPeriod.count()).toBe(0);
    await prisma.promoPartner.update({ where: { id: "q3-a-citrus" }, data: { reportReceived: true, reportReceivedAt: now } });
    const closed = await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2026, quarter: 3, lob: "iPhone" });
    expect(closed.status).toBe(200);
    expect(closed.body).toMatchObject({ status: "CLOSED", ready: false, expectedReports: 3, receivedReports: 3, pendingReports: 0, alreadyClosed: false, closedBy: { id: plm.id, email: plm.email } });
    const stored = await prisma.reportingPeriod.findUniqueOrThrow({ where: { year_quarter_lob: { year: 2026, quarter: 3, lob: "iPhone" } } });
    expect(stored).toMatchObject({ status: "CLOSED", closedByUserId: plm.id, closedAt: now });
    expect(await prisma.reportingPeriod.count({ where: { lob: "Mac" } })).toBe(0);
    expect(await prisma.reportingPeriod.count({ where: { quarter: 4 } })).toBe(0);
    const duplicate = await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2026, quarter: 3, lob: "iPhone" });
    expect(duplicate.body).toMatchObject({ status: "CLOSED", alreadyClosed: true });
    expect(await prisma.reportingPeriod.count()).toBe(1);
  });

  it("moves a closed period out of every normal workspace while keeping it in the read-only archive", async () => {
    const { plm, admin, kam } = await dataset();
    await prisma.promoPartner.update({ where: { id: "q3-a-citrus" }, data: { reportReceived: true, reportReceivedAt: now } });
    await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2026, quarter: 3, lob: "iPhone" }).expect(200);
    const [adminPromos, plmPromos, kamPromos] = await Promise.all([admin, plm, kam].map((user) => api().get("/api/promos").set(auth(user))));
    expect(adminPromos.body.map((promo: { id: string }) => promo.id).sort()).toEqual(["cross", "q3-mac"]);
    expect(plmPromos.body.map((promo: { id: string }) => promo.id).sort()).toEqual(["cross", "q3-mac"]);
    expect(kamPromos.body.map((promo: { id: string }) => promo.id)).toEqual(["cross"]);
    expect((await api().get("/api/promos/q3-a").set(auth(admin))).status).toBe(404);
    const archive = await api().get("/api/reporting/archive").set(auth(admin));
    expect(archive.status).toBe(200); expect(archive.body).toHaveLength(1);
    const detail = await api().get(`/api/reporting/archive/${archive.body[0].id}`).set(auth(plm));
    expect(detail.body.promos.map((promo: { id: string }) => promo.id)).toEqual(["q3-a", "q3-b"]);
    expect((await api().get("/api/reporting/archive").set(auth(kam))).status).toBe(403);
  });

  it("rejects every stale mutation path for closed history", async () => {
    const { plm, admin, kam, citrus } = await dataset();
    await prisma.promoPartner.update({ where: { id: "q3-a-citrus" }, data: { reportReceived: true, reportReceivedAt: now } });
    await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2026, quarter: 3, lob: "iPhone" }).expect(200);
    expect((await api().patch("/api/promo-partners/q3-a-rozetka/report").set(auth(admin)).send({ received: false })).status).toBe(409);
    expect((await api().patch("/api/promo-partners/q3-a-rozetka/report").set(auth(kam)).send({ received: false })).status).toBe(409);
    expect((await api().delete("/api/promos/q3-a").set(auth(admin))).status).toBe(409);
    expect((await api().delete(`/api/promos/q3-a/partners/${citrus.id}`).set(auth(admin))).status).toBe(409);
    expect((await api().get("/api/promos/q3-a/partner-options").set(auth(kam))).status).toBe(409);
    await expect(createPromoFromParsedSubject({ rawSubject: "iPhone Promo 10.07-20.07 - Rozetka", normalizedName: "promo q3-a", promoName: "Promo q3-a", lob: "iPhone", partner: "Rozetka", startDate: "2026-07-10", endDate: "2026-07-20", warnings: [], isValid: true })).rejects.toBeInstanceOf(ClosedReportingPeriodError);
    expect(await prisma.promo.count()).toBe(4);
    expect(await prisma.promoPartner.count()).toBe(5);
  });

  it("excludes closed history from reminders and rejects a stale reminder mutation", async () => {
    const { plm } = await dataset();
    await prisma.promoPartner.update({ where: { id: "q3-a-citrus" }, data: { reportReceived: true, reportReceivedAt: now } });
    await api().post("/api/reporting/close").set(auth(plm)).send({ year: 2026, quarter: 3, lob: "iPhone" }).expect(200);
    expect((await getReportReminderCandidates()).map(({ promoId }) => promoId)).not.toContain("q3-a");
    await expect(markFirstReminderSent("q3-a-rozetka", now)).rejects.toBeInstanceOf(ClosedReportingPeriodError);
  });
});
