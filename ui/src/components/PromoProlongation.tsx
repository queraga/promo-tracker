import type { PromoDto, SpecialPromo } from "../types";
import { ApiError } from "../shared/api/client";

const dateOnly = (value: string) => value.slice(0, 10);
const parseDate = (value: string) => new Date(`${dateOnly(value)}T00:00:00.000Z`);
const isoDate = (value: Date) => value.toISOString().slice(0, 10);
const displayDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(parseDate(value));
const quarter = (value: Date) => Math.floor(value.getUTCMonth() / 3) + 1;

export type ProlongationPreview =
  | { kind: "extended"; startDate: string; endDate: string }
  | { kind: "split"; currentQuarter: number; currentYear: number; currentStart: string; currentEnd: string; nextQuarter: number; nextYear: number; nextStart: string; nextEnd: string };

export function getProlongationPreview(promo: Pick<PromoDto, "startDate" | "endDate">, newEndDate: string): ProlongationPreview | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(newEndDate) || newEndDate <= dateOnly(promo.endDate)) return null;
  const currentEnd = parseDate(promo.endDate); const requestedEnd = parseDate(newEndDate);
  if (Number.isNaN(requestedEnd.getTime()) || isoDate(requestedEnd) !== newEndDate) return null;
  if (quarter(currentEnd) === quarter(requestedEnd) && currentEnd.getUTCFullYear() === requestedEnd.getUTCFullYear()) return { kind: "extended", startDate: dateOnly(promo.startDate), endDate: newEndDate };
  const expectedNextQuarter = quarter(currentEnd) === 4 ? 1 : quarter(currentEnd) + 1;
  const expectedNextYear = quarter(currentEnd) === 4 ? currentEnd.getUTCFullYear() + 1 : currentEnd.getUTCFullYear();
  if (quarter(requestedEnd) !== expectedNextQuarter || requestedEnd.getUTCFullYear() !== expectedNextYear) return null;
  const quarterEnd = new Date(Date.UTC(currentEnd.getUTCFullYear(), quarter(currentEnd) * 3, 0));
  const nextStart = new Date(quarterEnd); nextStart.setUTCDate(nextStart.getUTCDate() + 1);
  return { kind: "split", currentQuarter: quarter(currentEnd), currentYear: currentEnd.getUTCFullYear(), currentStart: dateOnly(promo.startDate), currentEnd: isoDate(quarterEnd), nextQuarter: quarter(requestedEnd), nextYear: requestedEnd.getUTCFullYear(), nextStart: isoDate(nextStart), nextEnd: newEndDate };
}

export function prolongationErrorMessage(reason: unknown) {
  if (!(reason instanceof ApiError)) return "Не вдалося виконати пролонгацію. Спробуйте ще раз.";
  if (reason.status === 400) return "Оберіть пізнішу дату в межах поточного або наступного кварталу.";
  if (reason.status === 403) return "У вас немає прав на пролонгацію промо.";
  if (reason.status === 404) return "Промо більше недоступне. Оновіть робочий простір.";
  if (reason.status === 409) return "Пролонгація неможлива: поточний або наступний квартал уже закрито.";
  return "Не вдалося виконати пролонгацію. Спробуйте ще раз.";
}

export function scopedProlongationErrorMessage(reason: unknown) {
  if (!(reason instanceof ApiError)) return "Не вдалося виконати пролонгацію. Спробуйте ще раз.";
  if (reason.status === 400) return "Перевірте нову дату завершення та вибраних партнерів.";
  if (reason.status === 403) return "У вас немає доступу до цієї дії.";
  if (reason.status === 404) return "Промо більше недоступне. Оновіть робочий простір.";
  if (reason.status === 409) return "Дані промо змінилися або період недоступний. Оновіть робочий простір.";
  return "Не вдалося виконати пролонгацію. Спробуйте ще раз.";
}

export const isKamProlongationEligible = (promo: Pick<PromoDto, "endDate">, now: Date = new Date()) => now.toISOString().slice(0, 10) <= dateOnly(promo.endDate);

export function ProlongedBadge({ prolongedAt }: { prolongedAt?: string | null }) { return prolongedAt ? <span className="prolonged-badge">Prolonged</span> : null; }

export function SpecialPromoBadge({ specialPromo }: { specialPromo?: SpecialPromo | null }) {
  if (!specialPromo) return null;
  const label = specialPromo.kind === "FSM"
    ? "FSM"
    : `${specialPromo.bank === "MONO" ? "mono" : "ПриватБанк"}${specialPromo.mechanic ? ` · ${specialPromo.mechanic}` : ""}`;
  return <span className="special-promo-badge">{label}</span>;
}

type Props = { promo: PromoDto; endDate: string; submitting: boolean; error: string; onEndDateChange: (value: string) => void; onCancel: () => void; onConfirm: () => void };
export function ProlongationDialog({ promo, endDate, submitting, error, onEndDateChange, onCancel, onConfirm }: Props) {
  const preview = getProlongationPreview(promo, endDate); const invalid = !preview;
  return <div className="partner-dialog-backdrop" role="presentation"><div className="partner-dialog prolongation-dialog" role="dialog" aria-modal="true" aria-labelledby="prolongation-title">
    <h3 id="prolongation-title">Пролонгація промо</h3><strong className="prolongation-name">{promo.name}</strong>
    <dl className="prolongation-current"><dt>Поточний період</dt><dd>{displayDate(promo.startDate)} – {displayDate(promo.endDate)}</dd></dl>
    <label className="prolongation-date"><span>Нова дата завершення</span><input type="date" min={isoDate(new Date(parseDate(promo.endDate).getTime() + 86400000))} value={endDate} disabled={submitting} onChange={(event) => onEndDateChange(event.target.value)} /></label>
    {endDate && invalid && <p className="prolongation-error" role="alert">Оберіть пізнішу дату в межах поточного або наступного кварталу.</p>}
    {preview?.kind === "extended" && <div className="prolongation-preview"><span>Новий період</span><strong>{displayDate(preview.startDate)} – {displayDate(preview.endDate)}</strong></div>}
    {preview?.kind === "split" && <div className="prolongation-preview"><span>Промо буде розділено за кварталами</span><div><b>Q{preview.currentQuarter} {preview.currentYear}</b><strong>{displayDate(preview.currentStart)} – {displayDate(preview.currentEnd)}</strong></div><div><b>Q{preview.nextQuarter} {preview.nextYear}</b><strong>{displayDate(preview.nextStart)} – {displayDate(preview.nextEnd)}</strong></div></div>}
    {error && <p className="prolongation-error" role="alert">{error}</p>}
    <div className="partner-dialog-actions"><button type="button" className="reset" disabled={submitting} onClick={onCancel}>Скасувати</button><button type="button" disabled={invalid || submitting} onClick={onConfirm}>{submitting ? "Збереження…" : "Підтвердити"}</button></div>
  </div></div>;
}

type ScopedProps = Props & { selectedPromoPartnerIds: string[]; onTogglePartner: (id: string) => void; onToggleAll: () => void };
export function ScopedProlongationDialog({ promo, endDate, submitting, error, selectedPromoPartnerIds, onEndDateChange, onTogglePartner, onToggleAll, onCancel, onConfirm }: ScopedProps) {
  const preview = getProlongationPreview(promo, endDate); const invalid = !preview; const allSelected = selectedPromoPartnerIds.length === promo.partners.length;
  return <div className="partner-dialog-backdrop" role="presentation"><div className="partner-dialog prolongation-dialog scoped-prolongation-dialog" role="dialog" aria-modal="true" aria-labelledby="scoped-prolongation-title">
    <h3 id="scoped-prolongation-title">Пролонгація промо</h3><strong className="prolongation-name">{promo.name}</strong>
    <section className="scoped-partners"><div><span>Ваші партнери</span><button type="button" disabled={submitting} onClick={onToggleAll}>{allSelected ? "Зняти вибір" : "Обрати всі"}</button></div><div className="partner-dialog-options">{promo.partners.map((partner) => <label key={partner.promoPartnerId}><input type="checkbox" value={partner.promoPartnerId} checked={selectedPromoPartnerIds.includes(partner.promoPartnerId)} disabled={submitting} onChange={() => onTogglePartner(partner.promoPartnerId)} /><span>{partner.partnerName}</span></label>)}</div></section>
    <dl className="prolongation-current"><dt>Поточний період</dt><dd>{displayDate(promo.startDate)} – {displayDate(promo.endDate)}</dd></dl>
    <label className="prolongation-date"><span>Нова дата завершення</span><input type="date" min={isoDate(new Date(parseDate(promo.endDate).getTime() + 86400000))} value={endDate} disabled={submitting} onChange={(event) => onEndDateChange(event.target.value)} /></label>
    {endDate && invalid && <p className="prolongation-error" role="alert">Оберіть пізнішу дату в межах поточного або наступного кварталу.</p>}
    {preview?.kind === "extended" && <div className="prolongation-preview"><span>Новий період</span><strong>{displayDate(preview.startDate)} – {displayDate(preview.endDate)}</strong></div>}
    {preview?.kind === "split" && <div className="prolongation-preview"><span>Промо буде розділено за кварталами</span><div><b>Q{preview.currentQuarter} {preview.currentYear}</b><strong>{displayDate(preview.currentStart)} – {displayDate(preview.currentEnd)}</strong></div><div><b>Q{preview.nextQuarter} {preview.nextYear}</b><strong>{displayDate(preview.nextStart)} – {displayDate(preview.nextEnd)}</strong></div></div>}
    {error && <p className="prolongation-error" role="alert">{error}</p>}
    <div className="partner-dialog-actions"><button type="button" className="reset" disabled={submitting} onClick={onCancel}>Скасувати</button><button type="button" disabled={invalid || submitting || selectedPromoPartnerIds.length === 0} onClick={onConfirm}>{submitting ? "Збереження…" : "Підтвердити"}</button></div>
  </div></div>;
}
