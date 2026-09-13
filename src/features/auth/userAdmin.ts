import { Prisma, type User, type UserRole } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { createUser } from "./createUser.js";
import { hashPassword } from "./password.js";

export type ManagedUser = Pick<User, "id" | "email" | "role" | "isActive" | "createdAt" | "updatedAt">;
export type UserAdminUpdate = { role?: UserRole; isActive?: boolean };

export class LastActiveSuperuserError extends Error {
  constructor() {
    super("At least one active SUPERUSER must remain");
  }
}

export const toManagedUser = (user: User): ManagedUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

export async function listUsers(): Promise<ManagedUser[]> {
  return (await prisma.user.findMany({ orderBy: { email: "asc" } })).map(toManagedUser);
}

export async function createManagedUser(email: string, password: string, role: UserRole): Promise<ManagedUser> {
  return toManagedUser(await createUser(email, password, role));
}

export async function updateManagedUser(id: number, update: UserAdminUpdate): Promise<ManagedUser | null> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) return null;

    const removesActiveSuperuser =
      user.role === "SUPERUSER" &&
      user.isActive &&
      (update.role === "USER" || update.isActive === false);
    if (removesActiveSuperuser) {
      const activeSuperusers = await tx.user.count({ where: { role: "SUPERUSER", isActive: true } });
      if (activeSuperusers <= 1) throw new LastActiveSuperuserError();
    }

    return toManagedUser(await tx.user.update({ where: { id }, data: update }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateManagedUserPassword(id: number, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return false;
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return true;
}
