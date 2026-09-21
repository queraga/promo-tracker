import type { User } from "@prisma/client";
import request from "supertest";
import { beforeEach, describe, expect, it } from "vitest";
import { createApi } from "../src/api/createApi.js";
import { AUTH_COOKIE } from "../src/features/auth/authMiddleware.js";
import { signAuthToken } from "../src/features/auth/authService.js";
import { prisma } from "../src/shared/db/prisma.js";

const secret = "test-secret-that-is-at-least-32-characters";
const now = new Date("2026-09-21T12:00:00.000Z");
const app = () => createApi({ jwtSecret: secret, now: () => now });
const authed = (user: User) => ({ Cookie: `${AUTH_COOKIE}=${signAuthToken(user, secret)}` });

type Fixture = Awaited<ReturnType<typeof fixture>>;
async function fixture() {
  const admin = await prisma.user.create({ data: { email: "admin@expand.test", passwordHash: "hash", role: "SUPERUSER" } });
  const kam = await prisma.user.create({ data: { email: "kam@expand.test", passwordHash: "hash", role: "KAM" } });
  const [kibernetiki, ispace, ktc, rozetka] = await Promise.all([
    prisma.partner.create({ data: { id: "p-kibernetiki", name: "Kibernetiki" } }),
    prisma.partner.create({ data: { id: "p-ispace", name: "iSpace" } }),
    prisma.partner.create({ data: { id: "p-ktc", name: "KTC" } }),
    prisma.partner.create({ data: { id: "p-rozetka", name: "Rozetka" } }),
  ]);
  await prisma.userPartner.createMany({ data: [kibernetiki, ispace, ktc].map(({ id: partnerId }) => ({ userId: kam.id, partnerId })) });
  const promo = await prisma.promo.create({ data: {
    id: "promo-visible", lob: "ACCY", name: "NPI Accessories Apple (Offer & Split)", normalizedName: "npi accessories apple offer split",
    startDate: new Date("2026-09-01Z"), endDate: new Date("2026-09-10Z"),
    partners: { create: { id: "relation-kibernetiki", partnerId: kibernetiki.id, rawEmailSubject: "NPI Accessories Apple - kibernetiki (Offer & Split) - 01.09-10.09" } },
  } });
  const hiddenPromo = await prisma.promo.create({ data: {
    id: "promo-hidden", lob: "iPhone", name: "Hidden promo", normalizedName: "hidden promo",
    startDate: new Date("2026-09-01Z"), endDate: new Date("2026-09-10Z"),
    partners: { create: { id: "relation-rozetka", partnerId: rozetka.id, rawEmailSubject: "Hidden promo 01.09-10.09 - Rozetka" } },
  } });
  return { admin, kam, kibernetiki, ispace, ktc, rozetka, promo, hiddenPromo };
}

beforeEach(async () => {
  await prisma.userPartner.deleteMany(); await prisma.user.deleteMany();
  await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany();
});

describe("promo partner expansion API", () => {
  it("requires authentication", async () => {
    const f = await fixture();
    expect((await request(app()).get(`/api/promos/${f.promo.id}/partner-options`)).status).toBe(401);
    expect((await request(app()).post(`/api/promos/${f.promo.id}/partners`).send({ partnerIds: [f.ispace.id] })).status).toBe(401);
  });
  it("returns only assigned KAM options and identifies an existing relation", async () => {
    const f = await fixture();
    const response = await request(app()).get(`/api/promos/${f.promo.id}/partner-options`).set(authed(f.kam));
    expect(response.status).toBe(200);
    expect(response.body).toEqual([
      { id: f.ispace.id, name: "iSpace", alreadyAssociated: false },
      { id: f.ktc.id, name: "KTC", alreadyAssociated: false },
      { id: f.kibernetiki.id, name: "Kibernetiki", alreadyAssociated: true },
    ]);
    expect(JSON.stringify(response.body)).not.toContain("Rozetka");
  });

  it("adds one or multiple assigned partners without duplicating Promo or relations", async () => {
    const f = await fixture();
    const one = await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ispace.id] });
    expect(one.status).toBe(200);
    expect(one.body.partners.map((partner: { partnerName: string }) => partner.partnerName)).toEqual(expect.arrayContaining(["Kibernetiki", "iSpace"]));
    const many = await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ispace.id, f.ktc.id, f.ktc.id] });
    expect(many.status).toBe(200);
    expect(await prisma.promo.count()).toBe(2);
    expect(await prisma.promoPartner.count({ where: { promoId: f.promo.id } })).toBe(3);
  });

  it("creates manual relations with clean subject, report, and reminder defaults", async () => {
    const f = await fixture();
    await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ispace.id] });
    expect(await prisma.promoPartner.findUniqueOrThrow({ where: { promoId_partnerId: { promoId: f.promo.id, partnerId: f.ispace.id } } })).toMatchObject({
      rawEmailSubject: null, reportReceived: false, reportReceivedAt: null, firstReminderSentAt: null, secondReminderSentAt: null,
    });
  });

  it("treats already-associated targets idempotently", async () => {
    const f = await fixture();
    const before = await prisma.promoPartner.count();
    expect((await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.kibernetiki.id] })).status).toBe(200);
    expect(await prisma.promoPartner.count()).toBe(before);
  });

  it("rejects mixed unauthorized targets atomically", async () => {
    const f = await fixture();
    const response = await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ktc.id, f.rozetka.id] });
    expect(response.status).toBe(403);
    expect(await prisma.promoPartner.count({ where: { promoId: f.promo.id, partnerId: f.ktc.id } })).toBe(0);
    expect(await prisma.promoPartner.count({ where: { promoId: f.promo.id } })).toBe(1);
  });

  it("hides an out-of-scope promo and applies revoked assignments on the next request", async () => {
    const f = await fixture();
    expect((await request(app()).post(`/api/promos/${f.hiddenPromo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ispace.id] })).status).toBe(404);
    await prisma.userPartner.delete({ where: { userId_partnerId: { userId: f.kam.id, partnerId: f.ktc.id } } });
    expect((await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ktc.id] })).status).toBe(403);
    expect(await prisma.promoPartner.count({ where: { promoId: f.promo.id, partnerId: f.ktc.id } })).toBe(0);
  });

  it("allows SUPERUSER expansion only to persisted partners", async () => {
    const f = await fixture();
    const options = await request(app()).get(`/api/promos/${f.promo.id}/partner-options`).set(authed(f.admin));
    expect(options.body.map((option: { name: string }) => option.name)).toEqual(expect.arrayContaining(["Kibernetiki", "iSpace", "KTC", "Rozetka"]));
    expect(options.body).toHaveLength(4);
    expect((await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.admin)).send({ partnerIds: [f.rozetka.id] })).status).toBe(200);
    expect(await prisma.partner.count()).toBe(4);
  });

  it("does not leak unrelated partner relations in the updated KAM response", async () => {
    const f = await fixture();
    await prisma.promoPartner.create({ data: { promoId: f.promo.id, partnerId: f.rozetka.id, rawEmailSubject: "Private Rozetka subject" } });
    const response = await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ispace.id] });
    expect(response.status).toBe(200);
    expect(response.body.partners.map((partner: { partnerName: string }) => partner.partnerName)).toEqual(expect.arrayContaining(["Kibernetiki", "iSpace"]));
    expect(response.body.partners.map((partner: { partnerName: string }) => partner.partnerName)).not.toContain("Rozetka");
  });

  it("returns 404 for unknown promos and rejects unknown or invalid partner input", async () => {
    const f = await fixture();
    expect((await request(app()).post("/api/promos/missing/partners").set(authed(f.kam)).send({ partnerIds: [f.ispace.id] })).status).toBe(404);
    expect((await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: ["missing"] })).status).toBe(403);
    expect((await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [] })).status).toBe(400);
  });

  it("includes a manual relation in pending reports and allows its normal report mutation", async () => {
    const f = await fixture();
    const expanded = await request(app()).post(`/api/promos/${f.promo.id}/partners`).set(authed(f.kam)).send({ partnerIds: [f.ispace.id] });
    const relation = expanded.body.partners.find((partner: { partnerId: string }) => partner.partnerId === f.ispace.id);
    const pending = await request(app()).get("/api/reports/pending").set(authed(f.kam));
    expect(pending.body.some((item: { promoPartnerId: string }) => item.promoPartnerId === relation.promoPartnerId)).toBe(true);
    const updated = await request(app()).patch(`/api/promo-partners/${relation.promoPartnerId}/report`).set(authed(f.kam)).send({ received: true });
    expect(updated.status).toBe(200);
    expect(updated.body.reportReceived).toBe(true);
  });
});
