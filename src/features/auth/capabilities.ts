import type { UserRole } from "@prisma/client";

export type UserCapability =
  | "manageUsers"
  | "managePartnerAssignments"
  | "deletePromo"
  | "deletePromoPartner"
  | "prolongPromo"
  | "prolongAssignedPromoPartners"
  | "mutateReportState"
  | "expandPromoPartners"
  | "viewQuarterlyReporting"
  | "closeReportingPeriod"
  | "viewArchive";

const roleCapabilities: Record<UserRole, ReadonlySet<UserCapability>> = {
  SUPERUSER: new Set(["manageUsers", "managePartnerAssignments", "deletePromo", "deletePromoPartner", "prolongPromo", "prolongAssignedPromoPartners", "mutateReportState", "expandPromoPartners", "viewQuarterlyReporting", "viewArchive"]),
  PLM: new Set(["viewQuarterlyReporting", "closeReportingPeriod", "viewArchive"]),
  KAM: new Set(["prolongAssignedPromoPartners", "mutateReportState", "expandPromoPartners"]),
};

export const hasCapability = (role: UserRole, capability: UserCapability): boolean => roleCapabilities[role].has(capability);
