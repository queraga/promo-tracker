import type { User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import { prisma } from "../src/shared/db/prisma.js";

const secret = "test-secret-that-is-at-least-32-characters";
const app = () => createApi({ jwtSecret: secret });
const authed = (user: User) => ({ Cookie: `${AUTH_COOKIE}=${signAuthToken(user, secret)}` });

beforeEach(async () => {
  await prisma.userPartner.deleteMany();
  await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany();
  await prisma.promo.deleteMany();
  await prisma.partner.deleteMany();
});

describe("KAM deletion", () => {
  it("deletes the KAM and assignments while preserving partners, promos, relations, and report state", async () => {
    const admin = await prisma.user.create({ data: { email: "admin@delete.test", passwordHash: "hash", role: "SUPERUSER" } });
    const kam = await prisma.user.create({ data: { email: "kam@delete.test", passwordHash: "hash", role: "KAM" } });
    const [citrus, moyo] = await Promise.all([
      prisma.partner.create({ data: { id: "delete-citrus", name: "Citrus" } }),
      prisma.partner.create({ data: { id: "delete-moyo", name: "MOYO" } }),
    ]);
    await prisma.userPartner.createMany({ data: [{ userId: kam.id, partnerId: citrus.id }, { userId: kam.id, partnerId: moyo.id }] });
    const reportReceivedAt = new Date("2026-09-20T12:00:00.000Z");
    await prisma.promo.create({ data: { id: "delete-promo", lob: "ACCY", name: "Preserved promo", normalizedName: "preserved promo", startDate: new Date("2026-09-01Z"), endDate: new Date("2026-09-02Z"), partners: { create: { id: "delete-relation", partnerId: citrus.id, rawEmailSubject: "Preserved subject", reportReceived: true, reportReceivedAt } } } });

    const response = await request(app()).delete(`/api/users/${kam.id}`).set(authed(admin));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });
    expect(await prisma.user.findUnique({ where: { id: kam.id } })).toBeNull();
    expect(await prisma.userPartner.count({ where: { userId: kam.id } })).toBe(0);
    expect(await prisma.partner.count()).toBe(2);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.promoPartner.count()).toBe(1);
    expect(await prisma.promoPartner.findUniqueOrThrow({ where: { id: "delete-relation" } })).toMatchObject({ partnerId: citrus.id, reportReceived: true, reportReceivedAt });
  });

  it("rejects deleting another SUPERUSER and deleting the authenticated SUPERUSER", async () => {
    const admin = await prisma.user.create({ data: { email: "admin@delete.test", passwordHash: "hash", role: "SUPERUSER" } });
    const other = await prisma.user.create({ data: { email: "other-admin@delete.test", passwordHash: "hash", role: "SUPERUSER" } });
    for (const target of [other, admin]) {
      expect((await request(app()).delete(`/api/users/${target.id}`).set(authed(admin))).status).toBe(409);
      expect(await prisma.user.findUnique({ where: { id: target.id } })).not.toBeNull();
    }
  });
});
