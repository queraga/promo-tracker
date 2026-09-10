import type { CurrentUser, PromoDto } from "../../types";
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> { const response = await fetch(path, { ...init, credentials: "include", headers: { "Content-Type": "application/json", ...init?.headers } }); if (!response.ok) { const body = await response.json().catch(() => ({ error: "Помилка запиту" })); throw new Error(body.error ?? "Помилка запиту"); } return response.json() as Promise<T>; }
export const getCurrentUser = () => apiFetch<CurrentUser>("/api/auth/me");
export const login = (email: string, password: string) => apiFetch<CurrentUser>("/api/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
export const logout = () => apiFetch<{ success: boolean }>("/api/auth/logout", { method: "POST" });
export const getPromos = () => apiFetch<PromoDto[]>("/api/promos");
export const getPromo = (id: string) => apiFetch<PromoDto>(`/api/promos/${id}`);
export const getPendingReports = () => apiFetch<unknown[]>("/api/reports/pending");
export const updateReportStatus = (id: string, received: boolean) => apiFetch<{ promoPartnerId: string; reportReceived: boolean; reportReceivedAt: string | null }>(`/api/promo-partners/${id}/report`, { method: "PATCH", body: JSON.stringify({ received }) });
export const deletePromo = (id: string) => apiFetch<{ success: boolean }>(`/api/promos/${id}`, { method: "DELETE" });
export const removePromoPartner = (promoId: string, partnerId: string) => apiFetch<{ success: boolean }>(`/api/promos/${promoId}/partners/${partnerId}`, { method: "DELETE" });
