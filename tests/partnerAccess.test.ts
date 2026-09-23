import type { User } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolvePartnerAccessScope } from "../src/features/partnerAccess/resolvePartnerAccessScope.js";

const user = (id: number, role: User["role"]): Pick<User, "id" | "role"> => ({ id, role });

describe("partner access scope", () => {
  it("returns global for SUPERUSER without loading assignments", async () => {
    const findPartnerIds = vi.fn().mockResolvedValue(["accidental-assignment"]);
    await expect(resolvePartnerAccessScope(user(1, "SUPERUSER"), findPartnerIds)).resolves.toEqual({ kind: "global" });
    expect(findPartnerIds).not.toHaveBeenCalled();
  });

  it("returns global for PLM without loading or requiring assignments", async () => {
    const findPartnerIds = vi.fn();
    await expect(resolvePartnerAccessScope(user(3, "PLM"), findPartnerIds)).resolves.toEqual({ kind: "global" });
    expect(findPartnerIds).not.toHaveBeenCalled();
  });

  it("returns restricted zero access for a KAM with no assignments", async () => {
    const scope = await resolvePartnerAccessScope(user(2, "KAM"), vi.fn().mockResolvedValue([]));
    expect(scope).toEqual({ kind: "restricted", partnerIds: [] });
    expect(scope.kind).not.toBe("global");
  });

  it("returns exactly one assigned partner for a KAM", async () => {
    await expect(resolvePartnerAccessScope(user(2, "KAM"), vi.fn().mockResolvedValue(["citrus-id"]))).resolves.toEqual({
      kind: "restricted",
      partnerIds: ["citrus-id"],
    });
  });

  it("returns all and only the current KAM assignments", async () => {
    const assignments = new Map<number, string[]>([[2, ["moyo-id", "citrus-id"]], [3, ["rozetka-id"]]]);
    const findPartnerIds = vi.fn(async (userId: number) => [...(assignments.get(userId) ?? [])]);

    await expect(resolvePartnerAccessScope(user(2, "KAM"), findPartnerIds)).resolves.toEqual({
      kind: "restricted",
      partnerIds: ["moyo-id", "citrus-id"],
    });
    await expect(resolvePartnerAccessScope(user(3, "KAM"), findPartnerIds)).resolves.toEqual({
      kind: "restricted",
      partnerIds: ["rozetka-id"],
    });
  });

  it("reflects assignment additions and removals on the next resolution", async () => {
    let assignments = ["citrus-id"];
    const findPartnerIds = vi.fn(async () => [...assignments]);
    await expect(resolvePartnerAccessScope(user(2, "KAM"), findPartnerIds)).resolves.toEqual({ kind: "restricted", partnerIds: ["citrus-id"] });

    assignments = ["citrus-id", "moyo-id"];
    await expect(resolvePartnerAccessScope(user(2, "KAM"), findPartnerIds)).resolves.toEqual({ kind: "restricted", partnerIds: ["citrus-id", "moyo-id"] });

    assignments = ["moyo-id"];
    await expect(resolvePartnerAccessScope(user(2, "KAM"), findPartnerIds)).resolves.toEqual({ kind: "restricted", partnerIds: ["moyo-id"] });
  });

  it("reflects role changes on the next resolution", async () => {
    const currentUser = user(2, "KAM");
    const findPartnerIds = vi.fn().mockResolvedValue([]);
    await expect(resolvePartnerAccessScope(currentUser, findPartnerIds)).resolves.toEqual({ kind: "restricted", partnerIds: [] });

    currentUser.role = "SUPERUSER";
    await expect(resolvePartnerAccessScope(currentUser, findPartnerIds)).resolves.toEqual({ kind: "global" });

    currentUser.role = "KAM";
    await expect(resolvePartnerAccessScope(currentUser, findPartnerIds)).resolves.toEqual({ kind: "restricted", partnerIds: [] });
  });
});
