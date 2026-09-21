import bcrypt from "bcrypt";
import { beforeEach, describe, expect, it } from "vitest";
import { createManagedUser, LastActiveSuperuserError, listUsers, updateManagedUser, updateManagedUserPassword } from "../src/features/auth/userAdmin.js";
import { prisma } from "../src/shared/db/prisma.js";

beforeEach(async () => { await prisma.user.deleteMany(); });

describe("user administration persistence", () => {
  it("lists users without password hashes", async () => {
    await createManagedUser("z@example.com", "strong-password", "KAM");
    await createManagedUser("a@example.com", "strong-password", "SUPERUSER");
    const users = await listUsers();
    expect(users.map((user) => user.email)).toEqual(["a@example.com", "z@example.com"]);
    expect(users[0]).not.toHaveProperty("passwordHash");
  });
  it("changes role and active state", async () => {
    const admin = await createManagedUser("admin@example.com", "strong-password", "SUPERUSER");
    await createManagedUser("backup@example.com", "strong-password", "SUPERUSER");
    expect(await updateManagedUser(admin.id, { role: "KAM", isActive: false })).toMatchObject({ role: "KAM", isActive: false });
  });
  it("keeps at least one active SUPERUSER", async () => {
    const admin = await createManagedUser("admin@example.com", "strong-password", "SUPERUSER");
    await expect(updateManagedUser(admin.id, { isActive: false })).rejects.toBeInstanceOf(LastActiveSuperuserError);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: admin.id } })).isActive).toBe(true);
  });
  it("updates the bcrypt password hash", async () => {
    const user = await createManagedUser("user@example.com", "old-password", "KAM");
    expect(await updateManagedUserPassword(user.id, "new-password")).toBe(true);
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(await bcrypt.compare("new-password", stored.passwordHash)).toBe(true);
    expect(await bcrypt.compare("old-password", stored.passwordHash)).toBe(false);
  });
  it("returns null/false for an unknown user", async () => {
    await expect(updateManagedUser(999, { role: "KAM" })).resolves.toBeNull();
    await expect(updateManagedUserPassword(999, "new-password")).resolves.toBe(false);
  });
});
