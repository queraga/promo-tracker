import { useEffect, useRef, useState } from "react";
import type { PartnerOption } from "../types";

type Props = { partners: PartnerOption[]; selected: string[] | null; onChange: (selected: string[] | null) => void };

export function PartnerColumnSelector({ partners, selected, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!container.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);

  const partnerIds = partners.map(({ id }) => id);
  const availableSelection = selected?.filter((partnerId) => partnerIds.includes(partnerId)) ?? null;
  const all = availableSelection === null;
  const selectedSet = new Set(availableSelection ?? partnerIds);
  const toggle = (partner: string, checked: boolean) => {
    const next = checked ? [...selectedSet, partner] : [...selectedSet].filter((name) => name !== partner);
    onChange(partnerIds.filter((id) => next.includes(id)));
  };

  return <div className="column-selector" ref={container}>
    <span className="control-label">Партнери</span>
    <button type="button" className="column-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{all ? "Усі партнери" : `Обрано ${availableSelection.length}`}</button>
    <div className="column-popover" role="group" aria-label="Партнери" hidden={!open}>
      <div className="column-actions">
        <button type="button" className="select-all" onClick={() => onChange(null)}>Обрати всіх</button>
        <button type="button" className="clear-columns" onClick={() => onChange([])}>Очистити</button>
      </div>
      <div className="column-options">{partners.map((partner) => <label key={partner.id}><input type="checkbox" checked={selectedSet.has(partner.id)} onChange={(event) => toggle(partner.id, event.target.checked)} /> <span>{partner.name}</span></label>)}</div>
    </div>
  </div>;
}
