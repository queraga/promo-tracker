import { useEffect, useState } from "react";
import { closeQuarter, getQuarterlySelections, getQuarterlySummary } from "../shared/api/client";
import type { CurrentUser, QuarterSelection, QuarterlySummary } from "../types";

const shortDate = (value: string) => new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(new Date(value));

export function QuarterlySummaryView({ summary, canClose, onClose }: { summary: QuarterlySummary; canClose: boolean; onClose: () => void }) {
  return <div className="quarter-content">
    <section className="quarter-hero"><div><span>Звіти</span><strong>{summary.receivedReports} / {summary.expectedReports} отримано</strong><b>{summary.completionPercentage}%</b></div><span className={`period-state ${summary.status.toLowerCase()}`}>{summary.status === "CLOSED" ? "Закрито" : summary.ready ? "Усі звіти отримано" : "Відкрито"}</span></section>
    {summary.expectedReports === 0 ? <div className="empty">У цьому кварталі немає очікуваних звітів.</div> : <>
      <section className="partner-progress">{summary.partners.map((partner) => <div key={partner.partnerId}><strong>{partner.partnerName}</strong><span>{partner.receivedReports} / {partner.expectedReports}</span><em>{partner.pendingReports ? `${partner.pendingReports} очікуються` : "✓"}</em></div>)}</section>
      <section className="pending-quarter"><h2>{summary.pendingReports ? `${summary.pendingReports} звіти ще очікуються` : "Усі звіти отримано"}</h2>{summary.partners.filter((p) => p.pendingReports).map((partner) => <div key={partner.partnerId}><h3>{partner.partnerName}</h3>{partner.pending.map((report) => <p key={report.promoPartnerId}><span>{report.promoName}</span><small>{shortDate(report.startDate)} – {shortDate(report.endDate)}</small></p>)}</div>)}</section>
    </>}
    {canClose && <button className="close-quarter" disabled={!summary.ready} onClick={onClose}>Закрити квартал</button>}
  </div>;
}

export function QuarterlyReporting({ user, onClosed, onError }: { user: CurrentUser; onClosed: () => void; onError: (message: string) => void }) {
  const [quarters, setQuarters] = useState<QuarterSelection[]>([]); const [lobs, setLobs] = useState<string[]>([]);
  const [quarter, setQuarter] = useState<QuarterSelection | null>(null); const [lob, setLob] = useState(""); const [summary, setSummary] = useState<QuarterlySummary | null>(null); const [loading, setLoading] = useState(true);
  useEffect(() => { getQuarterlySelections().then((data) => { setQuarters(data.quarters); setLobs(data.lobs); setQuarter(data.quarters[0] ?? null); setLob(data.lobs[0] ?? ""); }).catch((e) => onError(e.message)).finally(() => setLoading(false)); }, [onError]);
  useEffect(() => { if (!quarter || !lob) { setSummary(null); return; } setLoading(true); getQuarterlySummary(quarter.year, quarter.quarter, lob).then(setSummary).catch((e) => onError(e.message)).finally(() => setLoading(false)); }, [quarter, lob, onError]);
  const confirmClose = async () => { if (!summary || !window.confirm(`Закрити Q${summary.quarter} ${summary.year} · ${summary.lob}?\n\nУсі ${summary.expectedReports} звітів отримано. Після закриття промо буде переміщено до архіву та стане доступним лише для перегляду.`)) return; try { setSummary(await closeQuarter(summary.year, summary.quarter, summary.lob)); onClosed(); } catch (e) { onError((e as Error).message); } };
  return <div className="reporting-page"><header><span className="eyebrow">PLM звітність</span><h1>Квартальна звітність</h1><p>Готовність компенсаційної звітності за квартал і LOB</p></header><div className="reporting-selectors"><label>Квартал<select aria-label="Квартал" value={quarter ? `${quarter.year}-${quarter.quarter}` : ""} onChange={(event) => { const [year, q] = event.target.value.split("-").map(Number); setQuarter({ year, quarter: q }); }}>{quarters.map((item) => <option key={`${item.year}-${item.quarter}`} value={`${item.year}-${item.quarter}`}>Q{item.quarter} {item.year}</option>)}</select></label><label>LOB<select aria-label="LOB" value={lob} onChange={(event) => setLob(event.target.value)}>{lobs.map((item) => <option key={item}>{item}</option>)}</select></label></div>{loading ? <div className="empty">Завантаження…</div> : summary ? <QuarterlySummaryView summary={summary} canClose={user.role === "PLM"} onClose={() => void confirmClose()} /> : <div className="empty">Немає даних для звітності.</div>}</div>;
}
