import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { isUnassignedKamWorkspace, UnassignedKamWorkspace } from "../App";
import type { AdminPartnerCatalogItem, ManagedUser } from "../types";
import { assignmentKeysForUser, PartnerAssignmentSelector, partnerKeysForRole } from "./UserManagement";

const catalog: AdminPartnerCatalogItem[] = [
  { key: "canonical:Rozetka", id: "partner-rozetka", name: "Rozetka" },
  { key: "canonical:Comfy", id: null, name: "Comfy" },
];
const kam: ManagedUser = { id: 2, email: "kam@example.com", role: "KAM", isActive: true, createdAt: "2026-09-01", updatedAt: "2026-09-01", partners: [{ id: "partner-rozetka", name: "Rozetka" }] };

describe("KAM assignment administration", () => {
  it("maps persisted assignments to opaque catalog keys", () => expect(assignmentKeysForUser(kam, catalog)).toEqual(["canonical:Rozetka"]));
  it("keeps a newly materialized canonical assignment selected before catalog refresh", () => expect(assignmentKeysForUser({ partners: [{ id: "new-comfy-id", name: "Comfy" }] }, catalog)).toEqual(["canonical:Comfy"]));
  it("renders assigned partners, searchable choices, removal, and clear actions", () => {
    const html = renderToStaticMarkup(<PartnerAssignmentSelector catalog={catalog} selected={["canonical:Rozetka"]} onChange={vi.fn()} />);
    expect(html).toContain("Rozetka");
    expect(html).toContain("Comfy");
    expect(html).toContain("Пошук партнера");
    expect(html).toContain("Прибрати Rozetka");
    expect(html).toContain("Очистити");
  });
  it("shows an explicit zero-assignment state", () => expect(renderToStaticMarkup(<PartnerAssignmentSelector catalog={catalog} selected={[]} onChange={vi.fn()} />)).toContain("Не призначено"));
  it("clears assignments for SUPERUSER transitions and preserves them for KAM", () => {
    expect(partnerKeysForRole("SUPERUSER", ["canonical:Rozetka"])).toEqual([]);
    expect(partnerKeysForRole("KAM", ["canonical:Rozetka"])).toEqual(["canonical:Rozetka"]);
  });
});

describe("scoped KAM workspace", () => {
  it("shows the dedicated state only for a loaded KAM with zero assigned partners", () => {
    expect(isUnassignedKamWorkspace("KAM", [], false)).toBe(true);
    expect(isUnassignedKamWorkspace("KAM", [], true)).toBe(false);
    expect(isUnassignedKamWorkspace("SUPERUSER", [], false)).toBe(false);
  });
  it("uses the normal workspace for an assigned partner with zero promos", () => expect(isUnassignedKamWorkspace("KAM", ["Rozetka"], false)).toBe(false));
  it("renders the approved zero-assignment guidance", () => {
    const html = renderToStaticMarkup(<UnassignedKamWorkspace />);
    expect(html).toContain("Партнерів ще не призначено");
    expect(html).toContain("Зверніться до адміністратора для отримання доступу.");
    expect(html).not.toContain("Промо ще не додані");
  });
});
