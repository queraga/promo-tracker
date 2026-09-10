import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { getAllPromos } from "../features/promoQueries/getAllPromos.js";
import { getPendingReports } from "../features/promoQueries/getPendingReports.js";
import { getPromoById } from "../features/promoQueries/getPromoById.js";
import { getPromoPartnerById } from "../features/promoQueries/getPromoPartnerById.js";
import { markReportPending } from "../features/report/markReportPending.js";
import { markReportReceived } from "../features/report/markReportReceived.js";
import { toPendingReportDto, toPromoDto, type PendingReportRecord, type PromoRecord } from "./dto.js";

type ReportRecord = Awaited<ReturnType<typeof getPromoPartnerById>>;
export type ApiDependencies = { getAllPromos: () => Promise<PromoRecord[]>; getPromoById: (id: string) => Promise<PromoRecord | null>; getPendingReports: () => Promise<PendingReportRecord[]>; getPromoPartnerById: (id: string) => Promise<ReportRecord>; markReportReceived: (id: string) => Promise<NonNullable<ReportRecord>>; markReportPending: (id: string) => Promise<NonNullable<ReportRecord>>; now: () => Date };
const defaults: ApiDependencies = { getAllPromos, getPromoById, getPendingReports, getPromoPartnerById, markReportReceived: (id) => markReportReceived(id), markReportPending, now: () => new Date() };

export function createApi(overrides: Partial<ApiDependencies> = {}) {
  const services = { ...defaults, ...overrides };
  const app = express();
  app.use(cors({ origin: "http://localhost:5173" }));
  app.use(express.json());
  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.get("/api/promos", async (_req, res, next) => { try { res.json((await services.getAllPromos()).map((promo) => toPromoDto(promo, services.now()))); } catch (error) { next(error); } });
  app.get("/api/promos/:id", async (req, res, next) => { try { const promo = await services.getPromoById(req.params.id); if (!promo) { res.status(404).json({ error: "Промо не знайдено" }); return; } res.json(toPromoDto(promo, services.now())); } catch (error) { next(error); } });
  app.get("/api/reports/pending", async (_req, res, next) => { try { res.json((await services.getPendingReports()).map(toPendingReportDto)); } catch (error) { next(error); } });
  app.patch("/api/promo-partners/:id/report", async (req, res, next) => { try { if (typeof req.body?.received !== "boolean") { res.status(400).json({ error: "Поле received має бути boolean" }); return; } if (!await services.getPromoPartnerById(req.params.id)) { res.status(404).json({ error: "Участь партнера не знайдено" }); return; } const updated = req.body.received ? await services.markReportReceived(req.params.id) : await services.markReportPending(req.params.id); res.json({ promoPartnerId: updated.id, reportReceived: updated.reportReceived, reportReceivedAt: updated.reportReceivedAt?.toISOString() ?? null }); } catch (error) { next(error); } });
  app.use((_req: Request, res: Response) => res.status(404).json({ error: "Маршрут не знайдено" }));
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error("API request failed", error); res.status(500).json({ error: "Внутрішня помилка сервера" }); });
  return app;
}
