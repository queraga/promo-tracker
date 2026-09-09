import type { PromoPartner } from "@prisma/client";

export async function handleReportReceived(
  promoPartnerId: string,
  find: (id: string) => Promise<PromoPartner | null>,
  mark: (id: string) => Promise<PromoPartner>,
): Promise<"marked" | "already-received" | "missing"> {
  const report = await find(promoPartnerId);
  if (!report) return "missing";
  if (report.reportReceived) return "already-received";
  await mark(promoPartnerId);
  return "marked";
}
