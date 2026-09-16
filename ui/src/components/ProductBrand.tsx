type Props = { context?: "sidebar" | "login" };

export function ProductBrand({ context = "sidebar" }: Props) {
  return <div className={`brand brand-${context}`}>
    <img className="brand-icon" src="/brand/promo-tracker-icon.svg" alt="" aria-hidden="true" />
    <span className="brand-name">Promo Tracker</span>
  </div>;
}
