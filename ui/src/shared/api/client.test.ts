import { afterEach, describe, expect, it, vi } from "vitest";
import { createUser, getAdminPartners, replaceUserPartners } from "./client";

const ok = (body: unknown) => ({ ok: true, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe("KAM assignment API client", () => {
  it("loads the SUPERUSER partner catalog", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok([]));
    vi.stubGlobal("fetch", fetchMock);
    await getAdminPartners();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/partners", expect.objectContaining({ credentials: "include" }));
  });
  it("preserves catalog keys when creating a KAM", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({}));
    vi.stubGlobal("fetch", fetchMock);
    await createUser("kam@example.com", "strong-password", "KAM", ["canonical:Rozetka"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ email: "kam@example.com", password: "strong-password", role: "KAM", partnerKeys: ["canonical:Rozetka"] });
  });
  it("replaces and clears an existing KAM assignment set", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok({ partners: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await replaceUserPartners(7, []);
    expect(fetchMock).toHaveBeenCalledWith("/api/users/7/partners", expect.objectContaining({ method: "PUT", body: JSON.stringify({ partnerKeys: [] }) }));
  });
});
