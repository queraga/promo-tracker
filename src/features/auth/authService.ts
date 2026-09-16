import type { User, UserRole } from "@prisma/client";
import jwt from "jsonwebtoken";
import { prisma } from "../../shared/db/prisma.js";
import { verifyPassword } from "./password.js";

export const AUTH_SESSION_SECONDS = 30 * 24 * 60 * 60;
export const AUTH_SESSION_MAX_AGE_MS = AUTH_SESSION_SECONDS * 1000;

export type SafeUser = Pick<User, "id" | "email" | "role">;
export const toSafeUser = (user: User): SafeUser => ({ id: user.id, email: user.email, role: user.role });
export const findUserByEmail = (email: string) => prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
export const findUserById = (id: number) => prisma.user.findUnique({ where: { id } });
export async function authenticateUser(email: string, password: string, find: (email: string) => Promise<User | null> = findUserByEmail): Promise<User | null> {
  const user = await find(email);
  if (!user?.isActive || !await verifyPassword(password, user.passwordHash)) return null;
  return user;
}
export function signAuthToken(user: Pick<User, "id" | "role">, secret: string): string {
  return jwt.sign({ role: user.role }, secret, { subject: String(user.id), expiresIn: AUTH_SESSION_SECONDS });
}
export function verifyAuthToken(token: string, secret: string): { userId: number; role: UserRole } | null {
  try {
    const payload = jwt.verify(token, secret);
    if (typeof payload === "string" || !payload.sub || (payload.role !== "USER" && payload.role !== "SUPERUSER")) return null;
    const userId = Number(payload.sub);
    return Number.isInteger(userId) ? { userId, role: payload.role } : null;
  } catch { return null; }
}
