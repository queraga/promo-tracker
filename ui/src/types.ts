export type PromoStatus = "planned" | "active" | "finished";
export type PromoPartnerDto = { promoPartnerId: string; partnerId: string; partnerName: string; reportReceived: boolean; reportReceivedAt: string | null; rawEmailSubject: string };
export type PromoDto = { id: string; lob: string; name: string; startDate: string; endDate: string; status: PromoStatus; partners: PromoPartnerDto[] };
export type Filters = { search: string; lob: string; status: string; partner: string };
export type CurrentUser = { id: number; email: string; role: "KAM" | "SUPERUSER" };
export type ManagedUser = CurrentUser & { isActive: boolean; createdAt: string; updatedAt: string };
