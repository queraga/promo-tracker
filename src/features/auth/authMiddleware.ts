import type { User, UserRole } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { verifyAuthToken } from "./authService.js";

export const AUTH_COOKIE = "promo_tracker_session";
type FindUser = (id: number) => Promise<User | null>;
export function requireAuth(secret: string, findUser: FindUser) {
  return async (request: Request, response: Response, next: NextFunction) => {
    const token = request.cookies?.[AUTH_COOKIE];
    const session = typeof token === "string" ? verifyAuthToken(token, secret) : null;
    if (!session) { response.status(401).json({ error: "Необхідна авторизація" }); return; }
    const user = await findUser(session.userId);
    if (!user?.isActive) { response.status(401).json({ error: "Необхідна авторизація" }); return; }
    response.locals.user = user;
    next();
  };
}
export function requireRole(role: UserRole) {
  return (_request: Request, response: Response, next: NextFunction) => {
    if ((response.locals.user as User | undefined)?.role !== role) { response.status(403).json({ error: "Недостатньо прав" }); return; }
    next();
  };
}
