import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";
import { createUser } from "../src/features/auth/createUser.js";
import { deletePromo, removePromoPartner } from "../src/features/promoAdmin/deletePromo.js";
import { prisma } from "../src/shared/db/prisma.js";

beforeEach(async () => { await prisma.user.deleteMany(); await prisma.promoPartner.deleteMany(); await prisma.promo.deleteMany(); await prisma.partner.deleteMany(); });
async function dataset() {
  const [first, second] = await Promise.all([prisma.partner.create({ data: { name: "Rozetka" } }), prisma.partner.create({ data: { name: "MOYO" } })]);
  const promo = await prisma.promo.create({ data: { lob: "AW", name: "Test Promo", normalizedName: "test promo", startDate: new Date("2026-09-01Z"), endDate: new Date("2026-09-02Z"), partners: { create: [{ partnerId: first.id, rawEmailSubject: "one" }, { partnerId: second.id, rawEmailSubject: "two" }] } } });
  return { promo, first, second };
}

describe("admin persistence", () => {
  it("deletes a promo and its associations but keeps partners", async () => { const data = await dataset(); expect(await deletePromo(data.promo.id)).toBe(true); expect(await prisma.promo.count()).toBe(0); expect(await prisma.promoPartner.count()).toBe(0); expect(await prisma.partner.count()).toBe(2); });
  it("returns false for a nonexistent promo", async () => expect(deletePromo("missing")).resolves.toBe(false));
  it("removes only the selected association", async () => { const data = await dataset(); expect(await removePromoPartner(data.promo.id, data.first.id)).toBe(true); expect(await prisma.promo.count()).toBe(1); expect(await prisma.partner.count()).toBe(2); expect(await prisma.promoPartner.findMany()).toHaveLength(1); expect((await prisma.promoPartner.findFirst())?.partnerId).toBe(data.second.id); });
  it("returns false for a nonexistent association", async () => { const data = await dataset(); expect(await removePromoPartner(data.promo.id, "missing")).toBe(false); });
});

describe("user creation", () => {
  it("stores a bcrypt hash instead of plaintext", async () => { const user = await createUser("Admin@Example.com", "strong-password", "SUPERUSER"); expect(user.email).toBe("admin@example.com"); expect(user.passwordHash).not.toBe("strong-password"); expect(await bcrypt.compare("strong-password", user.passwordHash)).toBe(true); });
  it("rejects a duplicate email", async () => { await createUser("user@example.com", "strong-password", "KAM"); await expect(createUser("User@Example.com", "another-password", "KAM")).rejects.toMatchObject({ code: "P2002" }); });
  it("rejects an invalid role", async () => expect(createUser("user@example.com", "strong-password", "ADMIN")).rejects.toThrow("KAM or SUPERUSER"));
});

describe("UserPartner persistence", () => {
  it("supports zero, one, and multiple partner assignments", async () => {
    const user = await prisma.user.create({ data: { email: "assignments@example.com", passwordHash: "hash", role: "KAM" } });
    const [rozetka, moyo] = await Promise.all([
      prisma.partner.create({ data: { name: "Rozetka" } }),
      prisma.partner.create({ data: { name: "MOYO" } }),
    ]);

    expect(await prisma.userPartner.count({ where: { userId: user.id } })).toBe(0);
    await prisma.userPartner.create({ data: { userId: user.id, partnerId: rozetka.id } });
    expect(await prisma.userPartner.count({ where: { userId: user.id } })).toBe(1);
    await prisma.userPartner.create({ data: { userId: user.id, partnerId: moyo.id } });
    expect(await prisma.userPartner.count({ where: { userId: user.id } })).toBe(2);
  });

  it("prevents duplicate user and partner assignments", async () => {
    const user = await prisma.user.create({ data: { email: "duplicate-assignment@example.com", passwordHash: "hash" } });
    const partner = await prisma.partner.create({ data: { name: "Rozetka" } });
    await prisma.userPartner.create({ data: { userId: user.id, partnerId: partner.id } });
    await expect(prisma.userPartner.create({ data: { userId: user.id, partnerId: partner.id } })).rejects.toMatchObject({ code: "P2002" });
  });

  it("cascades assignments when a user is deleted", async () => {
    const user = await prisma.user.create({ data: { email: "user-cascade@example.com", passwordHash: "hash" } });
    const partner = await prisma.partner.create({ data: { name: "Rozetka" } });
    await prisma.userPartner.create({ data: { userId: user.id, partnerId: partner.id } });
    await prisma.user.delete({ where: { id: user.id } });
    expect(await prisma.userPartner.count()).toBe(0);
    expect(await prisma.partner.count()).toBe(1);
  });

  it("cascades assignments when a partner is deleted and preserves existing PromoPartner semantics", async () => {
    const user = await prisma.user.create({ data: { email: "partner-cascade@example.com", passwordHash: "hash" } });
    const partner = await prisma.partner.create({ data: { name: "Rozetka" } });
    const promo = await prisma.promo.create({ data: { lob: "ACCY", name: "Promo", normalizedName: "promo", startDate: new Date("2026-09-01Z"), endDate: new Date("2026-09-02Z") } });
    await prisma.userPartner.create({ data: { userId: user.id, partnerId: partner.id } });
    await prisma.promoPartner.create({ data: { promoId: promo.id, partnerId: partner.id, rawEmailSubject: "Promo" } });

    await prisma.partner.delete({ where: { id: partner.id } });

    expect(await prisma.userPartner.count()).toBe(0);
    expect(await prisma.promoPartner.count()).toBe(0);
    expect(await prisma.promo.count()).toBe(1);
    expect(await prisma.user.count()).toBe(1);
  });
});
