import { Prisma, type User, type UserRole } from "@prisma/client";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, { type NextFunction, type Request, type RequestHandler, type Response } from "express";
import path from "node:path";
import { AUTH_SESSION_MAX_AGE_MS, authenticateUser, findUserByEmail, findUserById, signAuthToken, toSafeUser } from "../features/auth/authService.js";
import { AUTH_COOKIE, requireAuth, requireRole } from "../features/auth/authMiddleware.js";
import { createManagedUser, LastActiveSuperuserError, listUsers, updateManagedUser, updateManagedUserPassword, type ManagedUser, type UserAdminUpdate } from "../features/auth/userAdmin.js";
import { deletePromo, removePromoPartner } from "../features/promoAdmin/deletePromo.js";
import { getPartnerNames } from "../features/partnerQueries/getPartnerNames.js";
import { getAllPromos } from "../features/promoQueries/getAllPromos.js";
import { getPendingReports } from "../features/promoQueries/getPendingReports.js";
import { getPromoById } from "../features/promoQueries/getPromoById.js";
import { getPromoPartnerById } from "../features/promoQueries/getPromoPartnerById.js";
import { markReportPending } from "../features/report/markReportPending.js";
import { markReportReceived } from "../features/report/markReportReceived.js";
import { toPendingReportDto, toPromoDto, type PendingReportRecord, type PromoRecord } from "./dto.js";

type ReportRecord = Awaited<ReturnType<typeof getPromoPartnerById>>;
export type ApiDependencies = { jwtSecret: string; findUserByEmail: (email: string) => Promise<User | null>; findUserById: (id: number) => Promise<User | null>; listUsers: () => Promise<ManagedUser[]>; createManagedUser: (email: string, password: string, role: UserRole) => Promise<ManagedUser>; updateManagedUser: (id: number, update: UserAdminUpdate) => Promise<ManagedUser | null>; updateManagedUserPassword: (id: number, password: string) => Promise<boolean>; getPartnerNames: () => Promise<string[]>; getAllPromos: () => Promise<PromoRecord[]>; getPromoById: (id: string) => Promise<PromoRecord | null>; getPendingReports: () => Promise<PendingReportRecord[]>; getPromoPartnerById: (id: string) => Promise<ReportRecord>; markReportReceived: (id: string) => Promise<NonNullable<ReportRecord>>; markReportPending: (id: string) => Promise<NonNullable<ReportRecord>>; deletePromo: (id: string) => Promise<boolean>; removePromoPartner: (promoId: string, partnerId: string) => Promise<boolean>; now: () => Date };
const defaults: Omit<ApiDependencies, "jwtSecret"> = { findUserByEmail, findUserById, listUsers, createManagedUser, updateManagedUser, updateManagedUserPassword, getPartnerNames, getAllPromos, getPromoById, getPendingReports, getPromoPartnerById, markReportReceived: (id) => markReportReceived(id), markReportPending, deletePromo, removePromoPartner, now: () => new Date() };
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
  app.post("/api/auth/login", async (req, res, next) => { try { if (typeof req.body?.email !== "string" || typeof req.body?.password !== "string") { res.status(400).json({ error: "Email і password обов'язкові" }); return; } const user = await authenticateUser(req.body.email, req.body.password, services.findUserByEmail); if (!user) { res.status(401).json({ error: "Невірний email або пароль" }); return; } res.cookie(AUTH_COOKIE, signAuthToken(user, jwtSecret), { ...cookieOptions, maxAge: AUTH_SESSION_MAX_AGE_MS }); res.json(toSafeUser(user)); } catch (error) { next(error); } });
  app.post("/api/auth/logout", (_req, res) => { res.clearCookie(AUTH_COOKIE, cookieOptions); res.json({ success: true }); });
  const authenticated = requireAuth(jwtSecret, services.findUserById);
  const superuserOnly: RequestHandler[] = [authenticated, requireRole("SUPERUSER")];
  app.get("/api/auth/me", authenticated, (_req, res) => res.json(toSafeUser(res.locals.user)));
  app.get("/api/partners", authenticated, async (_req, res, next) => { try { res.json(await services.getPartnerNames()); } catch (error) { next(error); } });
  app.get("/api/users", ...superuserOnly, async (_req, res, next) => { try { res.json(await services.listUsers()); } catch (error) { next(error); } });
  app.post("/api/users", ...superuserOnly, async (req, res, next) => { try { const { email, password, role = "USER" } = req.body ?? {}; if (typeof email !== "string" || typeof password !== "string" || (role !== "USER" && role !== "SUPERUSER")) { res.status(400).json({ error: "Email, password і коректна role обов'язкові" }); return; } res.status(201).json(await services.createManagedUser(email, password, role)); } catch (error) { if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") { res.status(409).json({ error: "Користувач із таким email уже існує" }); return; } if (error instanceof Error && /Invalid email|at least 8 characters/.test(error.message)) { res.status(400).json({ error: error.message }); return; } next(error); } });
  app.patch("/api/users/:id", ...superuserOnly, async (req, res, next) => { try { const id = Number(req.params.id); const { role, isActive } = req.body ?? {}; if (!Number.isInteger(id) || id <= 0 || (role === undefined && isActive === undefined) || (role !== undefined && role !== "USER" && role !== "SUPERUSER") || (isActive !== undefined && typeof isActive !== "boolean")) { res.status(400).json({ error: "Некоректні дані користувача" }); return; } const updated = await services.updateManagedUser(id, { ...(role === undefined ? {} : { role }), ...(isActive === undefined ? {} : { isActive }) }); if (!updated) { res.status(404).json({ error: "Користувача не знайдено" }); return; } res.json(updated); } catch (error) { if (error instanceof LastActiveSuperuserError) { res.status(409).json({ error: "Має залишитися хоча б один активний SUPERUSER" }); return; } next(error); } });
  app.put("/api/users/:id/password", ...superuserOnly, async (req, res, next) => { try { const id = Number(req.params.id); if (!Number.isInteger(id) || id <= 0 || typeof req.body?.password !== "string") { res.status(400).json({ error: "Коректний password обов'язковий" }); return; } if (!await services.updateManagedUserPassword(id, req.body.password)) { res.status(404).json({ error: "Користувача не знайдено" }); return; } res.json({ success: true }); } catch (error) { if (error instanceof Error && /at least 8 characters/.test(error.message)) { res.status(400).json({ error: error.message }); return; } next(error); } });
  app.get("/api/promos", authenticated, async (_req, res, next) => { try { res.json((await services.getAllPromos()).map((promo) => toPromoDto(promo, services.now()))); } catch (error) { next(error); } });
  app.get("/api/promos/:id", authenticated, async (req, res, next) => { try { const promo = await services.getPromoById(String(req.params.id)); if (!promo) { res.status(404).json({ error: "Промо не знайдено" }); return; } res.json(toPromoDto(promo, services.now())); } catch (error) { next(error); } });
  app.get("/api/reports/pending", authenticated, async (_req, res, next) => { try { res.json((await services.getPendingReports()).map(toPendingReportDto)); } catch (error) { next(error); } });
  app.patch("/api/promo-partners/:id/report", authenticated, async (req, res, next) => { try { const id = String(req.params.id); if (typeof req.body?.received !== "boolean") { res.status(400).json({ error: "Поле received має бути boolean" }); return; } if (!await services.getPromoPartnerById(id)) { res.status(404).json({ error: "Участь партнера не знайдено" }); return; } const updated = req.body.received ? await services.markReportReceived(id) : await services.markReportPending(id); res.json({ promoPartnerId: updated.id, reportReceived: updated.reportReceived, reportReceivedAt: updated.reportReceivedAt?.toISOString() ?? null }); } catch (error) { next(error); } });
  app.delete("/api/promos/:promoId", authenticated, requireRole("SUPERUSER"), async (req, res, next) => { try { if (!await services.deletePromo(String(req.params.promoId))) { res.status(404).json({ error: "Промо не знайдено" }); return; } res.json({ success: true }); } catch (error) { next(error); } });
  app.delete("/api/promos/:promoId/partners/:partnerId", authenticated, requireRole("SUPERUSER"), async (req, res, next) => { try { if (!await services.removePromoPartner(String(req.params.promoId), String(req.params.partnerId))) { res.status(404).json({ error: "Участь партнера не знайдено" }); return; } res.json({ success: true }); } catch (error) { next(error); } });

  if (process.env.NODE_ENV === "production") {
    const uiDistPath = path.resolve(process.cwd(), "ui/dist");
    const serveUi = express.static(uiDistPath);
    app.use((req, res, next) => {
      if (/^\/api(?:\/|$)/i.test(req.path)) return next();
      if (req.method !== "GET" && req.method !== "HEAD") return next();
      serveUi(req, res, (error) => {
        if (error) return next(error);
        res.sendFile(path.join(uiDistPath, "index.html"), (error) => {
          if (error) next(error);
        });
      });
    });
  }

  app.use((_req: Request, res: Response) => res.status(404).json({ error: "Маршрут не знайдено" }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error("API request failed", error); res.status(500).json({ error: "Внутрішня помилка сервера" }); });
  return app;
}
