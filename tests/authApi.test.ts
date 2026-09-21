import type { Partner, Promo, PromoPartner, User } from "@prisma/client";
import jwt, { type JwtPayload } from "jsonwebtoken";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApi, type ApiDependencies } from "../src/api/createApi.js";
import { AUTH_SESSION_SECONDS, verifyAuthToken } from "../src/features/auth/authService.js";
import { hashPassword } from "../src/features/auth/password.js";

const secret = "test-secret-that-is-at-least-32-characters"; const createdAt = new Date("2026-09-01T00:00:00Z"); let passwordHash = "";
beforeAll(async () => { passwordHash = await hashPassword("correct-password"); });
const makeUser = (role: User["role"] = "KAM", active = true): User => ({ id: role === "KAM" ? 1 : 2, email: `${role.toLowerCase()}@example.com`, passwordHash, role, isActive: active, createdAt, updatedAt: createdAt });
const promo: Promo = { id: "promo-1", lob: "AW", name: "Promo", normalizedName: "promo", startDate: createdAt, endDate: createdAt, createdAt, updatedAt: createdAt }; const partner: Partner = { id: "partner-1", name: "Rozetka", createdAt, updatedAt: createdAt }; const relation: PromoPartner = { id: "relation-1", promoId: promo.id, partnerId: partner.id, rawEmailSubject: "Promo", reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null, createdAt, updatedAt: createdAt }; const promoRecord = { ...promo, partners: [{ ...relation, partner }] };
function deps(user: User | null, overrides: Partial<ApiDependencies> = {}): Partial<ApiDependencies> { return { jwtSecret: secret, findUserByEmail: vi.fn().mockImplementation(async (email) => user?.email === email.trim().toLowerCase() ? user : null), findUserById: vi.fn().mockImplementation(async (id) => user?.id === id ? user : null), getAllPromos: vi.fn().mockResolvedValue([promoRecord]), getPromoById: vi.fn().mockResolvedValue(promoRecord), getPendingReports: vi.fn().mockResolvedValue([]), getPromoPartnerById: vi.fn().mockResolvedValue(relation), markReportReceived: vi.fn().mockResolvedValue({ ...relation, reportReceived: true }), markReportPending: vi.fn().mockResolvedValue(relation), deletePromo: vi.fn().mockResolvedValue(true), removePromoPartner: vi.fn().mockResolvedValue(true), now: () => createdAt, ...overrides }; }
async function loginAgent(user: User, overrides: Partial<ApiDependencies> = {}) { const agent = request.agent(createApi(deps(user, overrides))); const response = await agent.post("/api/auth/login").send({ email: user.email, password: "correct-password" }); expect(response.status).toBe(200); return agent; }

describe("authentication API", () => {
  it("logs in an active user and never returns passwordHash", async () => { const user = makeUser(); const response = await request(createApi(deps(user))).post("/api/auth/login").send({ email: user.email, password: "correct-password" }); expect(response.status).toBe(200); expect(response.body).toEqual({ id: 1, email: user.email, role: "KAM" }); expect(JSON.stringify(response.body)).not.toContain("passwordHash"); expect(response.headers["set-cookie"][0]).toContain("HttpOnly"); });
  it("sets matching 30-day cookie and JWT lifetimes", async () => { const user = makeUser(); const response = await request(createApi(deps(user))).post("/api/auth/login").send({ email: user.email, password: "correct-password" }); const cookie = response.headers["set-cookie"][0]; expect(cookie).toContain(`Max-Age=${AUTH_SESSION_SECONDS}`); const token = cookie.match(/^promo_tracker_session=([^;]+)/)?.[1]; const payload = jwt.decode(token ?? "") as JwtPayload | null; expect(payload?.exp && payload.iat ? payload.exp - payload.iat : 0).toBe(AUTH_SESSION_SECONDS); });
  it("accepts KAM and SUPERUSER tokens but rejects the legacy USER role", () => {
    expect(verifyAuthToken(jwt.sign({ role: "KAM" }, secret, { subject: "1" }), secret)?.role).toBe("KAM");
    expect(verifyAuthToken(jwt.sign({ role: "SUPERUSER" }, secret, { subject: "2" }), secret)?.role).toBe("SUPERUSER");
    expect(verifyAuthToken(jwt.sign({ role: "USER" }, secret, { subject: "3" }), secret)).toBeNull();
  });
  it("rejects a wrong password", async () => { const user = makeUser(); expect((await request(createApi(deps(user))).post("/api/auth/login").send({ email: user.email, password: "wrong-password" })).status).toBe(401); });
  it("rejects an unknown user", async () => expect((await request(createApi(deps(null))).post("/api/auth/login").send({ email: "missing@example.com", password: "correct-password" })).status).toBe(401));
  it("rejects an inactive user login", async () => { const user = makeUser("KAM", false); expect((await request(createApi(deps(user))).post("/api/auth/login").send({ email: user.email, password: "correct-password" })).status).toBe(401); });
  it("returns the authenticated user from /auth/me", async () => { const user = makeUser(); const agent = await loginAgent(user); const response = await agent.get("/api/auth/me"); expect(response.body).toEqual({ id: 1, email: user.email, role: "KAM" }); });
  it("returns 401 from /auth/me without a session", async () => expect((await request(createApi(deps(makeUser()))).get("/api/auth/me")).status).toBe(401));
  it("blocks an inactive user even with an existing cookie", async () => { const user = makeUser(); const agent = await loginAgent(user); user.isActive = false; expect((await agent.get("/api/promos")).status).toBe(401); });
  it("logout clears authentication", async () => { const agent = await loginAgent(makeUser()); const logout = await agent.post("/api/auth/logout"); expect(logout.headers["set-cookie"][0]).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/); expect((await agent.get("/api/auth/me")).status).toBe(401); });
});

describe("API authorization", () => {
  it("rejects unauthenticated tracker access", async () => expect((await request(createApi(deps(makeUser()))).get("/api/promos")).status).toBe(401));
  it("allows KAM to read tracker", async () => expect((await (await loginAgent(makeUser())).get("/api/promos")).status).toBe(200));
  it("allows KAM to read the partner catalog", async () => { const getPartnerNames = vi.fn().mockResolvedValue(["Rozetka"]); const response = await (await loginAgent(makeUser(), { getPartnerNames })).get("/api/partners"); expect(response.status).toBe(200); expect(response.body).toEqual(["Rozetka"]); });
  it("allows KAM to toggle report state", async () => expect((await (await loginAgent(makeUser())).patch("/api/promo-partners/relation-1/report").send({ received: true })).status).toBe(200));
  it("returns 403 when KAM directly deletes promo", async () => expect((await (await loginAgent(makeUser())).delete("/api/promos/promo-1")).status).toBe(403));
  it("returns 403 when KAM directly removes a partner", async () => expect((await (await loginAgent(makeUser())).delete("/api/promos/promo-1/partners/partner-1")).status).toBe(403));
  it("allows SUPERUSER to delete a promo", async () => { const remove = vi.fn().mockResolvedValue(true); const superuser = makeUser("SUPERUSER"); const agent = request.agent(createApi(deps(superuser, { deletePromo: remove }))); await agent.post("/api/auth/login").send({ email: superuser.email, password: "correct-password" }); expect((await agent.delete("/api/promos/promo-1")).status).toBe(200); expect(remove).toHaveBeenCalledWith("promo-1"); });
  it("allows SUPERUSER to remove a promo partner", async () => { const remove = vi.fn().mockResolvedValue(true); const superuser = makeUser("SUPERUSER"); const agent = request.agent(createApi(deps(superuser, { removePromoPartner: remove }))); await agent.post("/api/auth/login").send({ email: superuser.email, password: "correct-password" }); expect((await agent.delete("/api/promos/promo-1/partners/partner-1")).status).toBe(200); expect(remove).toHaveBeenCalledWith("promo-1", "partner-1"); });
  it("returns 404 when SUPERUSER deletes an unknown promo", async () => { const superuser = makeUser("SUPERUSER"); const agent = request.agent(createApi(deps(superuser, { deletePromo: vi.fn().mockResolvedValue(false) }))); await agent.post("/api/auth/login").send({ email: superuser.email, password: "correct-password" }); expect((await agent.delete("/api/promos/missing")).status).toBe(404); });
  it("returns 404 when SUPERUSER removes an unknown relation", async () => { const superuser = makeUser("SUPERUSER"); const agent = request.agent(createApi(deps(superuser, { removePromoPartner: vi.fn().mockResolvedValue(false) }))); await agent.post("/api/auth/login").send({ email: superuser.email, password: "correct-password" }); expect((await agent.delete("/api/promos/promo-1/partners/missing")).status).toBe(404); });
});
