import { useEffect, useRef, useState } from "react";

type Props = { partners: string[]; selected: string[] | null; onChange: (selected: string[] | null) => void };

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

  const all = selected === null;
  const selectedSet = new Set(selected ?? partners);
  const toggle = (partner: string, checked: boolean) => {
    const next = checked ? [...selectedSet, partner] : [...selectedSet].filter((name) => name !== partner);
    onChange(partners.filter((name) => next.includes(name)));
  };

  return <div className="column-selector" ref={container}>
    <span className="control-label">Колонки партнерів</span>
    <button type="button" className="column-trigger" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen((current) => !current)}>{all ? "Усі партнери" : `Обрано ${selected.length}`}</button>
    {open && <div className="column-popover" role="group" aria-label="Видимі колонки партнерів">
      <button type="button" className="select-all" onClick={() => onChange(null)}>Усі партнери</button>
      <div className="column-options">{partners.map((partner) => <label key={partner}><input type="checkbox" checked={selectedSet.has(partner)} onChange={(event) => toggle(partner, event.target.checked)} /> <span>{partner}</span></label>)}</div>
      {!all && <button type="button" className="reset-columns" onClick={() => onChange(null)}>Скинути до всіх</button>}
    </div>}
  </div>;
}
