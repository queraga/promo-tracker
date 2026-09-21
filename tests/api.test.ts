import type { Partner, Promo, PromoPartner, User } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApi, type ApiDependencies } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";

const now = new Date("2026-09-09T12:00:00.000Z"); const createdAt = new Date("2026-09-01T00:00:00.000Z"); const secret = "test-secret-that-is-at-least-32-characters";
const user: User = { id: 1, email: "user@example.com", passwordHash: "unused", role: "KAM", isActive: true, createdAt, updatedAt: createdAt };
const cookie = `${AUTH_COOKIE}=${signAuthToken(user, secret)}`;
const promo: Promo = { id: "promo-1", lob: "AW", name: "Apple Watch Promo", normalizedName: "apple watch promo", startDate: new Date("2026-09-07T00:00:00Z"), endDate: new Date("2026-09-13T00:00:00Z"), createdAt, updatedAt: createdAt };
const partner: Partner = { id: "partner-1", name: "Rozetka", createdAt, updatedAt: createdAt };
const relation: PromoPartner = { id: "relation-1", promoId: promo.id, partnerId: partner.id, rawEmailSubject: "AW <Promo> - Rozetka", reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null, createdAt, updatedAt: createdAt };
const promoRecord = { ...promo, partners: [{ ...relation, partner }] }; const pendingRecord = { ...relation, promo, partner };
function deps(overrides: Partial<ApiDependencies> = {}): Partial<ApiDependencies> { return { jwtSecret: secret, findUserByEmail: vi.fn().mockResolvedValue(user), findUserById: vi.fn().mockResolvedValue(user), getAllPromos: vi.fn().mockResolvedValue([promoRecord]), getPromoById: vi.fn().mockResolvedValue(promoRecord), getPendingReports: vi.fn().mockResolvedValue([pendingRecord]), setReportState: vi.fn().mockImplementation(async (_id, received) => ({ ...relation, reportReceived: received, reportReceivedAt: received ? now : null })), deletePromo: vi.fn().mockResolvedValue(true), removePromoPartner: vi.fn().mockResolvedValue(true), now: () => now, ...overrides }; }
const get = (path: string, overrides: Partial<ApiDependencies> = {}) => request(createApi(deps(overrides))).get(path).set("Cookie", cookie);

describe("Promo Tracker API", () => {
  it("GET /api/promos returns derived status and partner report state", async () => { const response = await get("/api/promos"); expect(response.status).toBe(200); expect(response.body[0]).toMatchObject({ id: "promo-1", status: "active", partners: [{ partnerName: "Rozetka", reportReceived: false }] }); expect(response.body[0]).not.toHaveProperty("normalizedName"); });
  it("GET /api/promos/:id returns an existing promo", async () => { const response = await get("/api/promos/promo-1"); expect(response.status).toBe(200); expect(response.body.partners[0].rawEmailSubject).toBe("AW <Promo> - Rozetka"); });
  it("GET /api/promos/:id returns 404 for an unknown promo", async () => expect((await get("/api/promos/missing", { getPromoById: vi.fn().mockResolvedValue(null) })).status).toBe(404));
  it("GET /api/reports/pending delegates to the existing service", async () => { const load = vi.fn().mockResolvedValue([pendingRecord]); const response = await get("/api/reports/pending", { getPendingReports: load }); expect(load).toHaveBeenCalledOnce(); expect(response.body[0]).toMatchObject({ promoPartnerId: "relation-1", promoName: "Apple Watch Promo" }); });
  it("PATCH report true delegates to the scoped report mutation", async () => { const setReportState = vi.fn().mockResolvedValue({ ...relation, reportReceived: true, reportReceivedAt: now }); const response = await request(createApi(deps({ setReportState }))).patch("/api/promo-partners/relation-1/report").set("Cookie", cookie).send({ received: true }); expect(response.status).toBe(200); expect(setReportState).toHaveBeenCalledWith("relation-1", true, expect.any(Object)); });
  it("PATCH report false delegates to the scoped report mutation", async () => { const setReportState = vi.fn().mockResolvedValue(relation); const response = await request(createApi(deps({ setReportState }))).patch("/api/promo-partners/relation-1/report").set("Cookie", cookie).send({ received: false }); expect(response.status).toBe(200); expect(setReportState).toHaveBeenCalledWith("relation-1", false, expect.any(Object)); });
  it("PATCH report rejects invalid input", async () => expect((await request(createApi(deps())).patch("/api/promo-partners/relation-1/report").set("Cookie", cookie).send({ received: "yes" })).status).toBe(400));
  it("PATCH report returns 404 for an unknown relation", async () => expect((await request(createApi(deps({ setReportState: vi.fn().mockResolvedValue(null) }))).patch("/api/promo-partners/missing/report").set("Cookie", cookie).send({ received: true })).status).toBe(404));
});
