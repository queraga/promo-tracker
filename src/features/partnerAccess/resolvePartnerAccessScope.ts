import type { User } from "@prisma/client";
import { prisma } from "../../shared/db/prisma.js";
import type { PartnerAccessScope } from "./partnerAccess.types.js";

type AssignmentLookup = (userId: number) => Promise<string[]>;

const loadAssignedPartnerIds: AssignmentLookup = async (userId) => {
  const assignments = await prisma.userPartner.findMany({
    where: { userId },
    select: { partnerId: true },
    orderBy: { partnerId: "asc" },
  });
  return assignments.map(({ partnerId }) => partnerId);
};

export async function resolvePartnerAccessScope(
  user: Pick<User, "id" | "role">,
  findPartnerIds: AssignmentLookup = loadAssignedPartnerIds,
): Promise<PartnerAccessScope> {
  if (user.role === "SUPERUSER") return { kind: "global" };
  return { kind: "restricted", partnerIds: await findPartnerIds(user.id) };
}
