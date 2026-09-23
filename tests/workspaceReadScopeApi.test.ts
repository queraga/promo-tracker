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
const patchReport = (id: string, user: User, received = true) => request(createApi({ jwtSecret: secret, now: () => now })).patch(`/api/promo-partners/${id}/report`).set("Cookie", cookie(user)).send({ received });

async function createPromo(id: string, name: string, partnerIds: string[]) {
  return prisma.promo.create({ data: {
    id,
    lob: "ACCY",
    name,
    normalizedName: name.toLowerCase(),
    startDate: new Date("2026-09-01T00:00:00.000Z"),
    endDate: new Date("2026-09-02T00:00:00.000Z"),
    partners: { create: partnerIds.map((partnerId) => ({ id: `${id}-${partnerId}`, partnerId, rawEmailSubject: `${name} subject for ${partnerId}` })) },
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
  const [superuser, plm, kamCitrus, kamCitrusMoyo, kamZero, kamZeroPromo] = await Promise.all([
    prisma.user.create({ data: { email: "admin@scope.test", passwordHash: "hash", role: "SUPERUSER" } }),
    prisma.user.create({ data: { email: "plm@scope.test", passwordHash: "hash", role: "PLM" } }),
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
  return { citrus, moyo, rozetka, zeroPromo, unused, superuser, plm, kamCitrus, kamCitrusMoyo, kamZero, kamZeroPromo };
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

  it("gives a zero-assignment PLM the complete global read workspace", async () => {
    const data = await createDataset();
    expect(await prisma.userPartner.count({ where: { userId: data.plm.id } })).toBe(0);
    const promos = await get("/api/promos", data.plm);
    expect(promos.status).toBe(200);
    expect(promos.body).toHaveLength(4);
    expect(promos.body.find((promo: { id: string }) => promo.id === "citrus-rozetka").partners).toHaveLength(2);
    expect((await get("/api/promos/rozetka-only", data.plm)).status).toBe(200);
    expect((await get("/api/partners", data.plm)).body).toEqual(["MOYO", "Citrus", "Rozetka"]);
    expect((await get("/api/reports/pending", data.plm)).body).toHaveLength(6);
  });

  it("keeps PLM global visibility separate from every business and admin mutation capability", async () => {
    const data = await createDataset();
    const client = request(createApi({ jwtSecret: secret, now: () => now }));
    const auth = { Cookie: cookie(data.plm) };
    const attempts = [
      client.delete("/api/promos/citrus-only").set(auth),
      client.delete(`/api/promos/citrus-only/partners/${data.citrus.id}`).set(auth),
      client.patch("/api/promo-partners/citrus-only-citrus-id/report").set(auth).send({ received: true }),
      client.post("/api/promos/citrus-only/partners").set(auth).send({ partnerIds: [data.moyo.id] }),
      client.get("/api/promos/citrus-only/partner-options").set(auth),
      client.get("/api/users").set(auth),
      client.get("/api/admin/partners").set(auth),
      client.post("/api/users").set(auth).send({ email: "new@test.dev", password: "strong-password", role: "KAM" }),
      client.patch(`/api/users/${data.kamCitrus.id}`).set(auth).send({ role: "PLM" }),
      client.patch(`/api/users/${data.kamCitrus.id}`).set(auth).send({ isActive: false }),
      client.put(`/api/users/${data.kamCitrus.id}/password`).set(auth).send({ password: "new-password" }),
      client.put(`/api/users/${data.kamCitrus.id}/partners`).set(auth).send({ partnerKeys: [] }),
      client.delete(`/api/users/${data.kamCitrus.id}`).set(auth),
    ];
    expect(await Promise.all(attempts).then((responses) => responses.map(({ status }) => status))).toEqual(Array(attempts.length).fill(403));
    expect(await prisma.promo.count()).toBe(4);
    expect(await prisma.promoPartner.count()).toBe(6);
    expect((await prisma.promoPartner.findUniqueOrThrow({ where: { id: "citrus-only-citrus-id" } })).reportReceived).toBe(false);
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

describe("partner-scoped report mutation API", () => {
  it("allows SUPERUSER to mutate every partner relation and returns 404 for a missing ID", async () => {
    const data = await createDataset();
    for (const id of ["citrus-only-citrus-id", "moyo-rozetka-moyo-id", "rozetka-only-rozetka-id"]) {
      expect((await patchReport(id, data.superuser)).status).toBe(200);
      expect((await prisma.promoPartner.findUniqueOrThrow({ where: { id } })).reportReceived).toBe(true);
    }
    expect((await patchReport("missing", data.superuser)).status).toBe(404);
  });

  it("allows a Citrus KAM only the Citrus relation and hides other and missing IDs identically", async () => {
    const data = await createDataset();
    expect((await patchReport("citrus-only-citrus-id", data.kamCitrus)).status).toBe(200);
    const unauthorized = await patchReport("rozetka-only-rozetka-id", data.kamCitrus);
    const unauthorizedMoyo = await patchReport("moyo-rozetka-moyo-id", data.kamCitrus);
    const missing = await patchReport("missing", data.kamCitrus);
    expect(unauthorized.status).toBe(404);
    expect(unauthorizedMoyo.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(unauthorized.body).toEqual(missing.body);
    expect(unauthorizedMoyo.body).toEqual(missing.body);
    const unchanged = await prisma.promoPartner.findMany({ where: { id: { in: ["rozetka-only-rozetka-id", "moyo-rozetka-moyo-id"] } } });
    expect(unchanged.every((relation) => !relation.reportReceived && relation.reportReceivedAt === null)).toBe(true);
  });

  it("allows a Citrus and MOYO KAM to mutate those relations but not Rozetka", async () => {
    const data = await createDataset();
    expect((await patchReport("citrus-only-citrus-id", data.kamCitrusMoyo)).status).toBe(200);
    expect((await patchReport("moyo-rozetka-moyo-id", data.kamCitrusMoyo)).status).toBe(200);
    expect((await patchReport("rozetka-only-rozetka-id", data.kamCitrusMoyo)).status).toBe(404);
    expect((await prisma.promoPartner.findUniqueOrThrow({ where: { id: "rozetka-only-rozetka-id" } })).reportReceived).toBe(false);
  });

  it("fails closed without mutating anything for a KAM with zero assignments", async () => {
    const data = await createDataset();
    for (const id of ["citrus-only-citrus-id", "moyo-rozetka-moyo-id", "rozetka-only-rozetka-id"]) {
      expect((await patchReport(id, data.kamZero)).status).toBe(404);
    }
    const relations = await prisma.promoPartner.findMany();
    expect(relations.every((relation) => !relation.reportReceived && relation.reportReceivedAt === null)).toBe(true);
  });

  it("authorizes the specific relation rather than every relation on a visible multi-partner Promo", async () => {
    const data = await createDataset();
    const citrusId = "citrus-rozetka-citrus-id";
    const rozetkaId = "citrus-rozetka-rozetka-id";
    expect((await patchReport(citrusId, data.kamCitrus)).status).toBe(200);
    expect((await patchReport(rozetkaId, data.kamCitrus)).status).toBe(404);
    expect(await prisma.promoPartner.findUniqueOrThrow({ where: { id: citrusId } })).toMatchObject({ reportReceived: true });
    expect(await prisma.promoPartner.findUniqueOrThrow({ where: { id: rozetkaId } })).toMatchObject({ reportReceived: false, reportReceivedAt: null });
  });

  it("applies assignment revoke and grant on the next mutation without re-login", async () => {
    const data = await createDataset();
    const citrusId = "citrus-only-citrus-id";
    const moyoId = "moyo-rozetka-moyo-id";
    expect((await patchReport(citrusId, data.kamCitrus)).status).toBe(200);
    await prisma.userPartner.delete({ where: { userId_partnerId: { userId: data.kamCitrus.id, partnerId: data.citrus.id } } });
    expect((await patchReport(citrusId, data.kamCitrus, false)).status).toBe(404);
    expect((await prisma.promoPartner.findUniqueOrThrow({ where: { id: citrusId } })).reportReceived).toBe(true);

    expect((await patchReport(moyoId, data.kamCitrus)).status).toBe(404);
    await prisma.userPartner.create({ data: { userId: data.kamCitrus.id, partnerId: data.moyo.id } });
    expect((await patchReport(moyoId, data.kamCitrus)).status).toBe(200);
    expect((await prisma.promoPartner.findUniqueOrThrow({ where: { id: moyoId } })).reportReceived).toBe(true);
  });
});
