import { useEffect, useState } from "react";
import { getArchive, getArchivedPeriod } from "../shared/api/client";
import type { ArchivedPeriod, ArchivedPeriodDetail } from "../types";

const date = (value: string) => new Intl.DateTimeFormat("uk-UA").format(new Date(value));
export function ArchiveDetail({ period }: { period: ArchivedPeriodDetail }) { return <section className="archive-detail"><header><h2>Q{period.quarter} {period.year} · {period.lob}</h2><p>Дані доступні лише для перегляду</p></header>{period.promos.map((promo) => <article key={promo.id}><div><strong>{promo.name}</strong><span>{date(promo.startDate)} – {date(promo.endDate)}</span></div><ul>{promo.partners.map((partner) => <li key={partner.promoPartnerId}>{partner.partnerName}<span>{partner.reportReceived ? "Звіт отримано ✓" : "Звіт очікується"}</span></li>)}</ul></article>)}</section>; }
export function ArchivePage({ onError }: { onError: (message: string) => void }) {
  const [periods, setPeriods] = useState<ArchivedPeriod[]>([]); const [detail, setDetail] = useState<ArchivedPeriodDetail | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { getArchive().then(setPeriods).catch((e) => onError(e.message)).finally(() => setLoading(false)); }, [onError]);
  const open = (id: string) => getArchivedPeriod(id).then(setDetail).catch((e) => onError(e.message));
  return <div className="archive-page"><header><span className="eyebrow">Історія звітності</span><h1>Архів</h1><p>Закриті квартали доступні лише для перегляду</p></header>{loading ? <div className="empty">Завантаження…</div> : detail ? <><button className="reset" onClick={() => setDetail(null)}>← До періодів</button><ArchiveDetail period={detail} /></> : periods.length ? <div className="archive-list">{periods.map((period) => <button key={period.id} onClick={() => void open(period.id)}><strong>Q{period.quarter} {period.year} · {period.lob}</strong><span>Закрито {date(period.closedAt!)}</span><em>{period.receivedReports} / {period.expectedReports} звітів отримано</em></button>)}</div> : <div className="empty">Закритих періодів ще немає.</div>}</div>;
}
