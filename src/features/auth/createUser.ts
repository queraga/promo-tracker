import type { UserRole } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import { hashPassword } from "./password.js";

export async function createUser(email: string, password: string, role: string) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) throw new Error("Invalid email");
  if (role !== "KAM" && role !== "SUPERUSER") throw new Error("Role must be KAM or SUPERUSER");
  const passwordHash = await hashPassword(password);
  return prisma.user.create({ data: { email: normalizedEmail, passwordHash, role: role as UserRole } });
}
