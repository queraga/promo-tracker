import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { LoginPage } from "./LoginPage";
import { PromoDrawer } from "./PromoDrawer";
import { ProductBrand } from "./ProductBrand";
import { UserManagement } from "./UserManagement";
import type { CurrentUser, PromoDto } from "../types";

const promo: PromoDto = { id: "promo-1", lob: "AW", name: "Test Promo", startDate: "2026-09-01", endDate: "2026-09-02", status: "finished", partners: [{ promoPartnerId: "relation-1", partnerId: "partner-1", partnerName: "Rozetka", reportReceived: false, reportReceivedAt: null, rawEmailSubject: "Test Promo" }] };
const user = (role: CurrentUser["role"]): CurrentUser => ({ id: 1, email: "user@example.com", role });
const drawer = (role: CurrentUser["role"]) => renderToStaticMarkup(<PromoDrawer promo={promo} user={user(role)} busyId={null} onClose={vi.fn()} onToggle={vi.fn()} onDeletePromo={vi.fn()} onRemovePartner={vi.fn()} />);

describe("authentication components", () => {
  it("renders the branded internal-workspace login form", () => { const html = renderToStaticMarkup(<LoginPage onLogin={vi.fn()} />); expect(html).toContain("Вхід"); expect(html).toContain("Внутрішній робочий простір"); expect(html).toContain("Доступ і облікові дані надає адміністратор."); expect(html).toContain('/brand/promo-tracker-icon.svg'); expect(html).not.toContain(">PT<"); expect(html).toContain('type="email"'); expect(html).toContain('type="password"'); });
  it("renders the new product identity in the application shell variant", () => { const html = renderToStaticMarkup(<ProductBrand />); expect(html).toContain("Promo Tracker"); expect(html).toContain('/brand/promo-tracker-icon.svg'); expect(html).not.toContain(">PT<"); });
  it("references valid favicon and brand assets", () => { const indexPath = fileURLToPath(new URL("../../index.html", import.meta.url)); const html = readFileSync(indexPath, "utf8"); expect(html).toContain('/brand/favicon.svg'); expect(html).toContain('/brand/favicon-32.png'); for (const asset of ["promo-tracker-icon.svg", "favicon.svg", "favicon-32.png", "app-icon-180.png"]) expect(existsSync(fileURLToPath(new URL(`../../public/brand/${asset}`, import.meta.url)))).toBe(true); });
  it("keeps mobile form controls at the iOS-safe 16px size", () => { const styles = readFileSync(fileURLToPath(new URL("../styles.css", import.meta.url)), "utf8"); expect(styles).toContain("@media(max-width:1024px){input,select,textarea{font-size:16px}"); expect(styles).toContain(".mobile-partner-select select{height:42px;font-size:16px}"); });
  it("does not render delete controls for KAM", () => { const html = drawer("KAM"); expect(html).not.toContain("Видалити промо"); expect(html).not.toContain("Видалити зв’язок"); });
  it("renders delete controls for SUPERUSER", () => { const html = drawer("SUPERUSER"); expect(html).toContain("Видалити промо"); expect(html).toContain("Видалити зв’язок"); });
  it("renders user provisioning and password controls for SUPERUSER administration", () => { const html = renderToStaticMarkup(<UserManagement currentUser={user("SUPERUSER")} onCurrentUserChange={vi.fn()} onError={vi.fn()} />); expect(html).toContain("Новий користувач"); expect(html).toContain("Тимчасовий пароль"); expect(html).toContain("SUPERUSER"); });
});
