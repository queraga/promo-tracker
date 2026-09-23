import type { UserRole } from "@prisma/client";

export type UserCapability =
  | "manageUsers"
  | "managePartnerAssignments"
  | "deletePromo"
  | "deletePromoPartner"
  | "mutateReportState"
  | "expandPromoPartners";

const roleCapabilities: Record<UserRole, ReadonlySet<UserCapability>> = {
  SUPERUSER: new Set(["manageUsers", "managePartnerAssignments", "deletePromo", "deletePromoPartner", "mutateReportState", "expandPromoPartners"]),
  PLM: new Set(),
  KAM: new Set(["mutateReportState", "expandPromoPartners"]),
};

export const hasCapability = (role: UserRole, capability: UserCapability): boolean => roleCapabilities[role].has(capability);
