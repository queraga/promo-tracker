import { Prisma, type User, type UserRole } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { orderAssignedPartners, resolvePartnerAssignmentKeys, SuperuserAssignmentsError, type AssignedPartner } from "../partnerAccess/partnerAssignments.js";
import { prepareUser } from "./createUser.js";
import { hashPassword } from "./password.js";

export type ManagedUser = Pick<User, "id" | "email" | "role" | "isActive" | "createdAt" | "updatedAt"> & { partners: AssignedPartner[] };
export type UserAdminUpdate = { role?: UserRole; isActive?: boolean };

export class LastActiveSuperuserError extends Error {
  constructor() {
    super("At least one active SUPERUSER must remain");
  }
}

export class SuperuserDeletionError extends Error {
  constructor() {
    super("SUPERUSER accounts cannot be deleted");
  }
}

type UserWithAssignments = User & { partners?: Array<{ partner: AssignedPartner }> };
export const toManagedUser = (user: UserWithAssignments): ManagedUser => ({
  id: user.id,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  partners: user.role === "SUPERUSER" ? [] : orderAssignedPartners((user.partners ?? []).map(({ partner: { id, name } }) => ({ id, name }))),
});

export async function listUsers(): Promise<ManagedUser[]> {
  return (await prisma.user.findMany({ include: { partners: { include: { partner: true } } }, orderBy: { email: "asc" } })).map(toManagedUser);
}

export async function createManagedUser(email: string, password: string, role: UserRole, partnerKeys: string[] = []): Promise<ManagedUser> {
  if (role === "SUPERUSER" && partnerKeys.length) throw new SuperuserAssignmentsError();
  const userData = await prepareUser(email, password, role);
  return prisma.$transaction(async (tx) => {
    const partners = role === "KAM" ? await resolvePartnerAssignmentKeys(tx, partnerKeys) : [];
    const user = await tx.user.create({ data: { ...userData, partners: { create: partners.map(({ id: partnerId }) => ({ partnerId })) } }, include: { partners: { include: { partner: true } } } });
    return toManagedUser(user);
  });
}

export async function updateManagedUser(id: number, update: UserAdminUpdate): Promise<ManagedUser | null> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id } });
    if (!user) return null;

    const removesActiveSuperuser =
      user.role === "SUPERUSER" &&
      user.isActive &&
      (update.role === "KAM" || update.isActive === false);
    if (removesActiveSuperuser) {
      const activeSuperusers = await tx.user.count({ where: { role: "SUPERUSER", isActive: true } });
      if (activeSuperusers <= 1) throw new LastActiveSuperuserError();
    }

    const finalRole = update.role ?? user.role;
    if (finalRole === "SUPERUSER") await tx.userPartner.deleteMany({ where: { userId: id } });
    if (user.role === "SUPERUSER" && finalRole === "KAM") await tx.userPartner.deleteMany({ where: { userId: id } });
    return toManagedUser(await tx.user.update({ where: { id }, data: update, include: { partners: { include: { partner: true } } } }));
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function updateManagedUserPassword(id: number, password: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) return false;
  const passwordHash = await hashPassword(password);
  await prisma.user.update({ where: { id }, data: { passwordHash } });
  return true;
}

export async function deleteManagedKam(id: number): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id }, select: { role: true } });
    if (!user) return false;
    if (user.role === "SUPERUSER") throw new SuperuserDeletionError();
    await tx.user.delete({ where: { id } });
    return true;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
