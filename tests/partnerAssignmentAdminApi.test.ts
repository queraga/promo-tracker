import type { User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import { CANONICAL_PARTNERS } from "../src/features/parsePromoSubject/parsePromoSubject.config.js";
import { prisma } from "../src/shared/db/prisma.js";

const secret = "test-secret-that-is-at-least-32-characters";
const app = () => createApi({ jwtSecret: secret, now: () => new Date("2026-09-21T12:00:00.000Z") });
const cookie = (user: User) => `${AUTH_COOKIE}=${signAuthToken(user, secret)}`;
const api = (user: User) => request(app());

async function users() {
  const superuser = await prisma.user.create({ data: { email: "admin@assign.test", passwordHash: "hash", role: "SUPERUSER" } });
  const backup = await prisma.user.create({ data: { email: "backup@assign.test", passwordHash: "hash", role: "SUPERUSER" } });
  const kam = await prisma.user.create({ data: { email: "kam@assign.test", passwordHash: "hash", role: "KAM" } });
  return { superuser, backup, kam };
}

const authed = (user: User) => ({ Cookie: cookie(user) });

beforeEach(async () => {
  await prisma.userPartner.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

describe("SUPERUSER partner assignment administration", () => {
  it("returns a non-mutating canonical and relevant legacy catalog only to SUPERUSER", async () => {
    const { superuser, kam } = await users();
    const canonical = await prisma.partner.create({ data: { name: "Citrus" } });
    const legacy = await prisma.partner.create({ data: { name: "ЖЖУК" } });
    await prisma.partner.create({ data: { name: "Unused Legacy" } });
    await prisma.userPartner.create({ data: { userId: kam.id, partnerId: legacy.id } });
    const before = await prisma.partner.count();

    const response = await api(superuser).get("/api/admin/partners").set(authed(superuser));
    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(CANONICAL_PARTNERS.length + 1);
    expect(response.body[0]).toMatchObject({ key: "canonical:iSpace", id: null, name: "iSpace" });
    expect(response.body.find((entry: { name: string }) => entry.name === "Citrus")).toEqual({ key: "canonical:Citrus", id: canonical.id, name: "Citrus" });
    expect(response.body.at(-1)).toEqual({ key: `partner:${legacy.id}`, id: legacy.id, name: "ЖЖУК" });
    expect(response.body.filter((entry: { name: string }) => entry.name === "Citrus")).toHaveLength(1);
    expect(response.body.some((entry: { name: string }) => entry.name === "Unused Legacy")).toBe(false);
    expect(await prisma.partner.count()).toBe(before);
    expect((await api(kam).get("/api/admin/partners").set(authed(kam))).status).toBe(403);
    expect((await api(kam).put(`/api/users/${kam.id}/partners`).set(authed(kam)).send({ partnerKeys: [] })).status).toBe(403);
  });

  it("lists KAM assignments while SUPERUSER partners remain empty", async () => {
    const { superuser, kam } = await users();
    const [citrus, moyo] = await Promise.all([
      prisma.partner.create({ data: { name: "Citrus" } }),
      prisma.partner.create({ data: { name: "MOYO" } }),
    ]);
    await prisma.userPartner.createMany({ data: [{ userId: kam.id, partnerId: citrus.id }, { userId: kam.id, partnerId: moyo.id }, { userId: superuser.id, partnerId: citrus.id }] });
    const response = await api(superuser).get("/api/users").set(authed(superuser));
    expect(response.status).toBe(200);
    expect(response.body.find((user: { id: number }) => user.id === kam.id).partners).toEqual([{ id: moyo.id, name: "MOYO" }, { id: citrus.id, name: "Citrus" }]);
    expect(response.body.find((user: { id: number }) => user.id === superuser.id).partners).toEqual([]);
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });

  it("creates KAM users with zero, existing, multiple, on-demand, and deduplicated assignments", async () => {
    const { superuser } = await users();
    const citrus = await prisma.partner.create({ data: { name: "Citrus" } });
    const zero = await api(superuser).post("/api/users").set(authed(superuser)).send({ email: "zero@example.com", password: "strong-password", role: "KAM" });
    expect(zero.status).toBe(201);
    expect(zero.body.partners).toEqual([]);

    const one = await api(superuser).post("/api/users").set(authed(superuser)).send({ email: "one@example.com", password: "strong-password", role: "KAM", partnerKeys: ["canonical:Citrus"] });
    expect(one.status).toBe(201);
    expect(one.body.partners).toEqual([{ id: citrus.id, name: "Citrus" }]);

    const assigned = await api(superuser).post("/api/users").set(authed(superuser)).send({ email: "assigned@example.com", password: "strong-password", role: "KAM", partnerKeys: ["canonical:Citrus", "canonical:iSpace", "canonical:Citrus"] });
    expect(assigned.status).toBe(201);
    expect(new Set(assigned.body.partners.map((partner: { name: string }) => partner.name))).toEqual(new Set(["Citrus", "iSpace"]));
    expect(await prisma.partner.count({ where: { name: "iSpace" } })).toBe(1);
    expect(await prisma.partner.findUniqueOrThrow({ where: { name: "Citrus" } })).toMatchObject({ id: citrus.id });
    expect(await prisma.userPartner.count({ where: { userId: assigned.body.id } })).toBe(2);
  });

  it("rejects invalid assignments and contradictory SUPERUSER assignments without partial state", async () => {
    const { superuser } = await users();
    const invalid = await api(superuser).post("/api/users").set(authed(superuser)).send({ email: "invalid@example.com", password: "strong-password", role: "KAM", partnerKeys: ["canonical:iSpace", "canonical:Citruss"] });
    expect(invalid.status).toBe(400);
    expect(await prisma.user.count({ where: { email: "invalid@example.com" } })).toBe(0);
    expect(await prisma.partner.count({ where: { name: "iSpace" } })).toBe(0);

    const contradictory = await api(superuser).post("/api/users").set(authed(superuser)).send({ email: "super@example.com", password: "strong-password", role: "SUPERUSER", partnerKeys: ["canonical:Citrus"] });
    expect(contradictory.status).toBe(400);
    expect(await prisma.user.count({ where: { email: "super@example.com" } })).toBe(0);
  });

  it("creates a normal SUPERUSER without assignments", async () => {
    const { superuser } = await users();
    const response = await api(superuser).post("/api/users").set(authed(superuser)).send({ email: "new-admin@example.com", password: "strong-password", role: "SUPERUSER" });
    expect(response.status).toBe(201);
    expect(response.body.partners).toEqual([]);
    expect(await prisma.userPartner.count({ where: { userId: response.body.id } })).toBe(0);
  });

  it("atomically replaces, deduplicates, and clears KAM assignments", async () => {
    const { superuser, kam } = await users();
    const [citrus, moyo] = await Promise.all([
      prisma.partner.create({ data: { name: "Citrus" } }),
      prisma.partner.create({ data: { name: "MOYO" } }),
    ]);
    await prisma.userPartner.createMany({ data: [{ userId: kam.id, partnerId: citrus.id }, { userId: kam.id, partnerId: moyo.id }] });
    const replaced = await api(superuser).put(`/api/users/${kam.id}/partners`).set(authed(superuser)).send({ partnerKeys: ["canonical:Citrus", "canonical:Rozetka", "canonical:Citrus"] });
    expect(replaced.status).toBe(200);
    expect(new Set(replaced.body.partners.map((partner: { name: string }) => partner.name))).toEqual(new Set(["Citrus", "Rozetka"]));
    expect((await prisma.userPartner.findMany({ where: { userId: kam.id }, include: { partner: true } })).map(({ partner }) => partner.name).sort()).toEqual(["Citrus", "Rozetka"]);
    expect(await prisma.partner.count({ where: { name: "Rozetka" } })).toBe(1);

    const cleared = await api(superuser).put(`/api/users/${kam.id}/partners`).set(authed(superuser)).send({ partnerKeys: [] });
    expect(cleared.status).toBe(200);
    expect(cleared.body.partners).toEqual([]);
    expect(await prisma.userPartner.count({ where: { userId: kam.id } })).toBe(0);
  });

  it("rolls back invalid replacement and rejects assignment replacement for SUPERUSER", async () => {
    const { superuser, kam } = await users();
    const citrus = await prisma.partner.create({ data: { name: "Citrus" } });
    await prisma.userPartner.create({ data: { userId: kam.id, partnerId: citrus.id } });
    const invalid = await api(superuser).put(`/api/users/${kam.id}/partners`).set(authed(superuser)).send({ partnerKeys: ["canonical:iSpace", "canonical:Citruss"] });
    expect(invalid.status).toBe(400);
    expect((await prisma.userPartner.findMany({ where: { userId: kam.id } })).map(({ partnerId }) => partnerId)).toEqual([citrus.id]);
    expect(await prisma.partner.count({ where: { name: "iSpace" } })).toBe(0);

    expect((await api(superuser).put(`/api/users/${superuser.id}/partners`).set(authed(superuser)).send({ partnerKeys: ["canonical:Citrus"] })).status).toBe(409);
    expect(await prisma.userPartner.count({ where: { userId: superuser.id } })).toBe(0);
  });

  it("clears assignments on promotion and demotes SUPERUSER to zero-scope KAM", async () => {
    const { superuser, backup, kam } = await users();
    const citrus = await prisma.partner.create({ data: { name: "Citrus" } });
    await prisma.userPartner.create({ data: { userId: kam.id, partnerId: citrus.id } });
    expect((await api(superuser).patch(`/api/users/${kam.id}`).set(authed(superuser)).send({ role: "SUPERUSER" })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: kam.id } })).role).toBe("SUPERUSER");
    expect(await prisma.userPartner.count({ where: { userId: kam.id } })).toBe(0);

    expect((await api(superuser).patch(`/api/users/${backup.id}`).set(authed(superuser)).send({ role: "KAM" })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: backup.id } })).role).toBe("KAM");
    expect(await prisma.userPartner.count({ where: { userId: backup.id } })).toBe(0);
  });

  it("preserves assignments for KAM updates, deactivation, and reactivation", async () => {
    const { superuser, kam } = await users();
    const citrus = await prisma.partner.create({ data: { name: "Citrus" } });
    await prisma.userPartner.create({ data: { userId: kam.id, partnerId: citrus.id } });
    for (const isActive of [false, true]) {
      expect((await api(superuser).patch(`/api/users/${kam.id}`).set(authed(superuser)).send({ role: "KAM", isActive })).status).toBe(200);
      expect(await prisma.userPartner.count({ where: { userId: kam.id, partnerId: citrus.id } })).toBe(1);
    }
  });

  it("updates scoped read and report mutation access on the next KAM request", async () => {
    const { superuser, kam } = await users();
    const [citrus, moyo] = await Promise.all([
      prisma.partner.create({ data: { id: "dynamic-citrus", name: "Citrus" } }),
      prisma.partner.create({ data: { id: "dynamic-moyo", name: "MOYO" } }),
    ]);
    await prisma.userPartner.create({ data: { userId: kam.id, partnerId: citrus.id } });
    for (const partner of [citrus, moyo]) {
      await prisma.promo.create({ data: { id: `promo-${partner.id}`, lob: "ACCY", name: partner.name, normalizedName: partner.name.toLowerCase(), startDate: new Date("2026-09-01Z"), endDate: new Date("2026-09-02Z"), partners: { create: { id: `relation-${partner.id}`, partnerId: partner.id, rawEmailSubject: partner.name } } } });
    }
    expect((await api(kam).get("/api/promos").set(authed(kam))).body.map((promo: { id: string }) => promo.id)).toEqual([`promo-${citrus.id}`]);
    expect((await api(kam).patch(`/api/promo-partners/relation-${moyo.id}/report`).set(authed(kam)).send({ received: true })).status).toBe(404);

    expect((await api(superuser).put(`/api/users/${kam.id}/partners`).set(authed(superuser)).send({ partnerKeys: ["canonical:MOYO"] })).status).toBe(200);
    expect((await api(kam).get("/api/promos").set(authed(kam))).body.map((promo: { id: string }) => promo.id)).toEqual([`promo-${moyo.id}`]);
    expect((await api(kam).get(`/api/promos/promo-${citrus.id}`).set(authed(kam))).status).toBe(404);
    expect((await api(kam).patch(`/api/promo-partners/relation-${citrus.id}/report`).set(authed(kam)).send({ received: true })).status).toBe(404);
    expect((await api(kam).patch(`/api/promo-partners/relation-${moyo.id}/report`).set(authed(kam)).send({ received: true })).status).toBe(200);
  });
});
