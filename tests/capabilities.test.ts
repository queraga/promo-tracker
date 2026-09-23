import { describe, expect, it } from "vitest";
import { hasCapability, type UserCapability } from "../src/features/auth/capabilities.js";

const capabilities: UserCapability[] = ["manageUsers", "managePartnerAssignments", "deletePromo", "deletePromoPartner", "mutateReportState", "expandPromoPartners"];

describe("role capabilities", () => {
  it("keeps PLM read-only even though its workspace scope is global", () => {
    expect(capabilities.every((capability) => !hasCapability("PLM", capability))).toBe(true);
    expect(hasCapability("PLM", "viewQuarterlyReporting")).toBe(true);
    expect(hasCapability("PLM", "closeReportingPeriod")).toBe(true);
    expect(hasCapability("PLM", "viewArchive")).toBe(true);
  });

  it("preserves SUPERUSER capabilities and KAM scoped business mutations", () => {
    expect(capabilities.every((capability) => hasCapability("SUPERUSER", capability))).toBe(true);
    expect(hasCapability("SUPERUSER", "viewQuarterlyReporting")).toBe(true);
    expect(hasCapability("SUPERUSER", "viewArchive")).toBe(true);
    expect(hasCapability("SUPERUSER", "closeReportingPeriod")).toBe(false);
    expect(hasCapability("KAM", "mutateReportState")).toBe(true);
    expect(hasCapability("KAM", "expandPromoPartners")).toBe(true);
    expect(hasCapability("KAM", "manageUsers")).toBe(false);
    expect(hasCapability("KAM", "deletePromo")).toBe(false);
  });
});
