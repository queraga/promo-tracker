import type { User } from "@prisma/client";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { authenticateUser, findUserByEmail, findUserById, signAuthToken, toSafeUser } from "../features/auth/authService.js";
import { AUTH_COOKIE, requireAuth, requireRole } from "../features/auth/authMiddleware.js";
import { deletePromo, removePromoPartner } from "../features/promoAdmin/deletePromo.js";
import { getAllPromos } from "../features/promoQueries/getAllPromos.js";
import { getPendingReports } from "../features/promoQueries/getPendingReports.js";
import { getPromoById } from "../features/promoQueries/getPromoById.js";
import { getPromoPartnerById } from "../features/promoQueries/getPromoPartnerById.js";
import { markReportPending } from "../features/report/markReportPending.js";
import { markReportReceived } from "../features/report/markReportReceived.js";
import { toPendingReportDto, toPromoDto, type PendingReportRecord, type PromoRecord } from "./dto.js";

type ReportRecord = Awaited<ReturnType<typeof getPromoPartnerById>>;
export type ApiDependencies = { jwtSecret: string; findUserByEmail: (email: string) => Promise<User | null>; findUserById: (id: number) => Promise<User | null>; getAllPromos: () => Promise<PromoRecord[]>; getPromoById: (id: string) => Promise<PromoRecord | null>; getPendingReports: () => Promise<PendingReportRecord[]>; getPromoPartnerById: (id: string) => Promise<ReportRecord>; markReportReceived: (id: string) => Promise<NonNullable<ReportRecord>>; markReportPending: (id: string) => Promise<NonNullable<ReportRecord>>; deletePromo: (id: string) => Promise<boolean>; removePromoPartner: (promoId: string, partnerId: string) => Promise<boolean>; now: () => Date };
const defaults: Omit<ApiDependencies, "jwtSecret"> = { findUserByEmail, findUserById, getAllPromos, getPromoById, getPendingReports, getPromoPartnerById, markReportReceived: (id) => markReportReceived(id), markReportPending, deletePromo, removePromoPartner, now: () => new Date() };
const cookieOptions = { httpOnly: true, sameSite: "lax" as const, secure: process.env.NODE_ENV === "production", path: "/" };

export function createApi(overrides: Partial<ApiDependencies> = {}) {
  const services = { ...defaults, ...overrides };
  const jwtSecret = overrides.jwtSecret ?? process.env.AUTH_JWT_SECRET;
  if (!jwtSecret || jwtSecret.length < 32) throw new Error("AUTH_JWT_SECRET must contain at least 32 characters");
  const app = express();
  app.use(cors({ origin: "http://localhost:5173", credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.post("/api/auth/login", async (req, res, next) => { try { if (typeof req.body?.email !== "string" || typeof req.body?.password !== "string") { res.status(400).json({ error: "Email і password обов'язкові" }); return; } const user = await authenticateUser(req.body.email, req.body.password, services.findUserByEmail); if (!user) { res.status(401).json({ error: "Невірний email або пароль" }); return; } res.cookie(AUTH_COOKIE, signAuthToken(user, jwtSecret), { ...cookieOptions, maxAge: 12 * 60 * 60 * 1000 }); res.json(toSafeUser(user)); } catch (error) { next(error); } });
  app.post("/api/auth/logout", (_req, res) => { res.clearCookie(AUTH_COOKIE, cookieOptions); res.json({ success: true }); });
  const authenticated = requireAuth(jwtSecret, services.findUserById);
  app.get("/api/auth/me", authenticated, (_req, res) => res.json(toSafeUser(res.locals.user)));
  app.get("/api/promos", authenticated, async (_req, res, next) => { try { res.json((await services.getAllPromos()).map((promo) => toPromoDto(promo, services.now()))); } catch (error) { next(error); } });
  app.get("/api/promos/:id", authenticated, async (req, res, next) => { try { const promo = await services.getPromoById(String(req.params.id)); if (!promo) { res.status(404).json({ error: "Промо не знайдено" }); return; } res.json(toPromoDto(promo, services.now())); } catch (error) { next(error); } });
  app.get("/api/reports/pending", authenticated, async (_req, res, next) => { try { res.json((await services.getPendingReports()).map(toPendingReportDto)); } catch (error) { next(error); } });
  app.patch("/api/promo-partners/:id/report", authenticated, async (req, res, next) => { try { const id = String(req.params.id); if (typeof req.body?.received !== "boolean") { res.status(400).json({ error: "Поле received має бути boolean" }); return; } if (!await services.getPromoPartnerById(id)) { res.status(404).json({ error: "Участь партнера не знайдено" }); return; } const updated = req.body.received ? await services.markReportReceived(id) : await services.markReportPending(id); res.json({ promoPartnerId: updated.id, reportReceived: updated.reportReceived, reportReceivedAt: updated.reportReceivedAt?.toISOString() ?? null }); } catch (error) { next(error); } });
  app.delete("/api/promos/:promoId", authenticated, requireRole("SUPERUSER"), async (req, res, next) => { try { if (!await services.deletePromo(String(req.params.promoId))) { res.status(404).json({ error: "Промо не знайдено" }); return; } res.json({ success: true }); } catch (error) { next(error); } });
  app.delete("/api/promos/:promoId/partners/:partnerId", authenticated, requireRole("SUPERUSER"), async (req, res, next) => { try { if (!await services.removePromoPartner(String(req.params.promoId), String(req.params.partnerId))) { res.status(404).json({ error: "Участь партнера не знайдено" }); return; } res.json({ success: true }); } catch (error) { next(error); } });
  app.use((_req: Request, res: Response) => res.status(404).json({ error: "Маршрут не знайдено" }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error("API request failed", error); res.status(500).json({ error: "Внутрішня помилка сервера" }); });
  return app;
}
