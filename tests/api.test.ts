import type { Partner, Promo, PromoPartner } from "@prisma/client";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createApi, type ApiDependencies } from "../src/api/createApi.js";

const now = new Date("2026-09-09T12:00:00.000Z");
const createdAt = new Date("2026-09-01T00:00:00.000Z");
const promo: Promo = { id: "promo-1", lob: "AW", name: "Apple Watch Promo", normalizedName: "apple watch promo", startDate: new Date("2026-09-07T00:00:00Z"), endDate: new Date("2026-09-13T00:00:00Z"), createdAt, updatedAt: createdAt };
const partner: Partner = { id: "partner-1", name: "Rozetka", createdAt, updatedAt: createdAt };
const relation: PromoPartner = { id: "relation-1", promoId: promo.id, partnerId: partner.id, rawEmailSubject: "AW <Promo> - Rozetka", reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null, createdAt, updatedAt: createdAt };
const promoRecord = { ...promo, partners: [{ ...relation, partner }] };
const pendingRecord = { ...relation, promo, partner };
function deps(overrides: Partial<ApiDependencies> = {}): Partial<ApiDependencies> { return { getAllPromos: vi.fn().mockResolvedValue([promoRecord]), getPromoById: vi.fn().mockResolvedValue(promoRecord), getPendingReports: vi.fn().mockResolvedValue([pendingRecord]), getPromoPartnerById: vi.fn().mockResolvedValue(relation), markReportReceived: vi.fn().mockResolvedValue({ ...relation, reportReceived: true, reportReceivedAt: now }), markReportPending: vi.fn().mockResolvedValue(relation), now: () => now, ...overrides }; }

describe("Promo Tracker API", () => {
  it("GET /api/promos returns derived status and partner report state", async () => { const response = await request(createApi(deps())).get("/api/promos"); expect(response.status).toBe(200); expect(response.body[0]).toMatchObject({ id: "promo-1", status: "active", partners: [{ partnerName: "Rozetka", reportReceived: false }] }); expect(response.body[0]).not.toHaveProperty("normalizedName"); });
  it("GET /api/promos/:id returns an existing promo", async () => { const response = await request(createApi(deps())).get("/api/promos/promo-1"); expect(response.status).toBe(200); expect(response.body.partners[0].rawEmailSubject).toBe("AW <Promo> - Rozetka"); });
  it("GET /api/promos/:id returns 404 for an unknown promo", async () => { expect((await request(createApi(deps({ getPromoById: vi.fn().mockResolvedValue(null) }))).get("/api/promos/missing")).status).toBe(404); });
  it("GET /api/reports/pending delegates to the existing service", async () => { const load = vi.fn().mockResolvedValue([pendingRecord]); const response = await request(createApi(deps({ getPendingReports: load }))).get("/api/reports/pending"); expect(load).toHaveBeenCalledOnce(); expect(response.body[0]).toMatchObject({ promoPartnerId: "relation-1", promoName: "Apple Watch Promo" }); });
  it("PATCH report true calls markReportReceived", async () => { const mark = vi.fn().mockResolvedValue({ ...relation, reportReceived: true, reportReceivedAt: now }); const response = await request(createApi(deps({ markReportReceived: mark }))).patch("/api/promo-partners/relation-1/report").send({ received: true }); expect(response.status).toBe(200); expect(mark).toHaveBeenCalledWith("relation-1"); expect(response.body.reportReceived).toBe(true); });
  it("PATCH report false calls markReportPending", async () => { const mark = vi.fn().mockResolvedValue(relation); const response = await request(createApi(deps({ markReportPending: mark }))).patch("/api/promo-partners/relation-1/report").send({ received: false }); expect(response.status).toBe(200); expect(mark).toHaveBeenCalledWith("relation-1"); });
  it("PATCH report rejects invalid input", async () => { expect((await request(createApi(deps())).patch("/api/promo-partners/relation-1/report").send({ received: "yes" })).status).toBe(400); });
  it("PATCH report returns 404 for an unknown relation", async () => { expect((await request(createApi(deps({ getPromoPartnerById: vi.fn().mockResolvedValue(null) }))).patch("/api/promo-partners/missing/report").send({ received: true })).status).toBe(404); });
});
