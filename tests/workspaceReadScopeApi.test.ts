import type { User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import { prisma } from "../src/shared/db/prisma.js";

const secret = "test-secret-that-is-at-least-32-characters";
const now = new Date("2026-09-21T12:00:00.000Z");
type Dataset = Awaited<ReturnType<typeof createDataset>>;

const cookie = (user: User) => `${AUTH_COOKIE}=${signAuthToken(user, secret)}`;
const get = (path: string, user: User) => request(createApi({ jwtSecret: secret, now: () => now })).get(path).set("Cookie", cookie(user));

async function createPromo(id: string, name: string, partnerIds: string[]) {
  return prisma.promo.create({ data: {
    id,
    lob: "ACCY",
    name,
    normalizedName: name.toLowerCase(),
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    endDate: new Date("2026-09-02T00:00:00.000Z"),
    partners: { create: partnerIds.map((partnerId) => ({ partnerId, rawEmailSubject: `${name} subject for ${partnerId}` })) },
  } });
}

async function createDataset() {
  const [citrus, moyo, rozetka, zeroPromo, unused] = await Promise.all([
    prisma.partner.create({ data: { id: "citrus-id", name: "Citrus" } }),
    prisma.partner.create({ data: { id: "moyo-id", name: "MOYO" } }),
    prisma.partner.create({ data: { id: "rozetka-id", name: "Rozetka" } }),
    prisma.partner.create({ data: { id: "ktc-id", name: "KTC" } }),
    prisma.partner.create({ data: { id: "unused-id", name: "Unused Legacy" } }),
  ]);
  const [superuser, kamCitrus, kamCitrusMoyo, kamZero, kamZeroPromo] = await Promise.all([
    prisma.user.create({ data: { email: "admin@scope.test", passwordHash: "hash", role: "SUPERUSER" } }),
    prisma.user.create({ data: { email: "citrus@scope.test", passwordHash: "hash", role: "KAM" } }),
    prisma.user.create({ data: { email: "multi@scope.test", passwordHash: "hash", role: "KAM" } }),
    prisma.user.create({ data: { email: "zero@scope.test", passwordHash: "hash", role: "KAM" } }),
    prisma.user.create({ data: { email: "zero-promo@scope.test", passwordHash: "hash", role: "KAM" } }),
  ]);
  await prisma.userPartner.createMany({ data: [
    { userId: kamCitrus.id, partnerId: citrus.id },
    { userId: kamCitrusMoyo.id, partnerId: citrus.id },
    { userId: kamCitrusMoyo.id, partnerId: moyo.id },
    { userId: kamZeroPromo.id, partnerId: zeroPromo.id },
  ] });
  await Promise.all([
    createPromo("citrus-only", "Citrus only", [citrus.id]),
    createPromo("rozetka-only", "Rozetka only", [rozetka.id]),
    createPromo("citrus-rozetka", "Citrus and Rozetka", [citrus.id, rozetka.id]),
    createPromo("moyo-rozetka", "MOYO and Rozetka", [moyo.id, rozetka.id]),
  ]);
  return { citrus, moyo, rozetka, zeroPromo, unused, superuser, kamCitrus, kamCitrusMoyo, kamZero, kamZeroPromo };
}

beforeEach(async () => {
  await prisma.userPartner.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

describe("partner-scoped workspace read API", () => {
  it("preserves global reads and used-partner discovery for SUPERUSER", async () => {
    const data = await createDataset();
    const promos = await get("/api/promos", data.superuser);
    expect(promos.status).toBe(200);
    expect(promos.body).toHaveLength(4);
    expect(promos.body.find((promo: { id: string }) => promo.id === "citrus-rozetka").partners).toHaveLength(2);
    expect((await get("/api/promos/rozetka-only", data.superuser)).status).toBe(200);
    expect((await get("/api/reports/pending", data.superuser)).body).toHaveLength(6);
    expect((await get("/api/partners", data.superuser)).body).toEqual(["MOYO", "Citrus", "Rozetka"]);
  });

  it("returns only Citrus promos and nested relations for a Citrus KAM", async () => {
    const data = await createDataset();
    const response = await get("/api/promos", data.kamCitrus);
    expect(response.status).toBe(200);
    expect(response.body.map((promo: { id: string }) => promo.id).sort()).toEqual(["citrus-only", "citrus-rozetka"]);
    const shared = response.body.find((promo: { id: string }) => promo.id === "citrus-rozetka");
    expect(shared.partners).toHaveLength(1);
    expect(shared.partners[0]).toMatchObject({ partnerId: data.citrus.id, partnerName: "Citrus" });
    expect(JSON.stringify(shared)).not.toContain(data.rozetka.id);
    expect(JSON.stringify(shared)).not.toContain(`subject for ${data.rozetka.id}`);
  });

  it("returns 404 for unauthorized promo IDs and filtered relations for authorized IDs", async () => {
    const data = await createDataset();
    expect((await get("/api/promos/rozetka-only", data.kamCitrus)).status).toBe(404);
    expect((await get("/api/promos/moyo-rozetka", data.kamCitrus)).status).toBe(404);
    const shared = await get("/api/promos/citrus-rozetka", data.kamCitrus);
    expect(shared.status).toBe(200);
    expect(shared.body.partners).toHaveLength(1);
    expect(shared.body.partners[0].partnerId).toBe(data.citrus.id);
  });

  it("scopes pending reports and authorized partner roster for a Citrus KAM", async () => {
    const data = await createDataset();
    const reports = await get("/api/reports/pending", data.kamCitrus);
    expect(reports.body).toHaveLength(2);
    expect(new Set(reports.body.map((report: { partnerId: string }) => report.partnerId))).toEqual(new Set([data.citrus.id]));
    expect((await get("/api/partners", data.kamCitrus)).body).toEqual(["Citrus"]);
  });

  it("returns the Citrus and MOYO union without Rozetka nested data", async () => {
    const data = await createDataset();
    const promos = await get("/api/promos", data.kamCitrusMoyo);
    expect(promos.body.map((promo: { id: string }) => promo.id).sort()).toEqual(["citrus-only", "citrus-rozetka", "moyo-rozetka"]);
    expect(promos.body.find((promo: { id: string }) => promo.id === "citrus-rozetka").partners.map((partner: { partnerId: string }) => partner.partnerId)).toEqual([data.citrus.id]);
    expect(promos.body.find((promo: { id: string }) => promo.id === "moyo-rozetka").partners.map((partner: { partnerId: string }) => partner.partnerId)).toEqual([data.moyo.id]);
    const reports = await get("/api/reports/pending", data.kamCitrusMoyo);
    expect(reports.body).toHaveLength(3);
    expect(new Set(reports.body.map((report: { partnerId: string }) => report.partnerId))).toEqual(new Set([data.citrus.id, data.moyo.id]));
    expect((await get("/api/partners", data.kamCitrusMoyo)).body).toEqual(["MOYO", "Citrus"]);
  });

  it("fails closed for a KAM with zero assignments", async () => {
    const data = await createDataset();
    expect((await get("/api/promos", data.kamZero)).body).toEqual([]);
    expect((await get("/api/partners", data.kamZero)).body).toEqual([]);
    expect((await get("/api/reports/pending", data.kamZero)).body).toEqual([]);
    expect((await get("/api/promos/citrus-only", data.kamZero)).status).toBe(404);
  });

  it("includes an assigned zero-promo partner without exposing unrelated promos", async () => {
    const data = await createDataset();
    expect((await get("/api/partners", data.kamZeroPromo)).body).toEqual(["KTC"]);
    expect((await get("/api/promos", data.kamZeroPromo)).body).toEqual([]);
  });

  it("applies assignment grants and revocations on the next request without re-login", async () => {
    const data = await createDataset();
    expect((await get("/api/partners", data.kamCitrus)).body).toEqual(["Citrus"]);
    await prisma.userPartner.create({ data: { userId: data.kamCitrus.id, partnerId: data.moyo.id } });
    expect((await get("/api/partners", data.kamCitrus)).body).toEqual(["MOYO", "Citrus"]);
    expect((await get("/api/promos/moyo-rozetka", data.kamCitrus)).status).toBe(200);
    await prisma.userPartner.delete({ where: { userId_partnerId: { userId: data.kamCitrus.id, partnerId: data.citrus.id } } });
    expect((await get("/api/partners", data.kamCitrus)).body).toEqual(["MOYO"]);
    expect((await get("/api/promos/citrus-only", data.kamCitrus)).status).toBe(404);
  });
});
