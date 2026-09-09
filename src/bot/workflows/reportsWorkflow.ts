import type { getPendingReports } from "../../features/promoQueries/getPendingReports.js";
import { formatPendingReport } from "../formatters/formatPendingReport.js";

type Reports = Awaited<ReturnType<typeof getPendingReports>>;

export async function getPendingReportViews(
  loadReports: () => Promise<Reports>,
): Promise<Array<{ promoPartnerId: string; text: string }>> {
  return (await loadReports()).map((report) => ({
    promoPartnerId: report.id,
    text: formatPendingReport(report),
  }));
}
