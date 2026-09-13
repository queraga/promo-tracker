import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../src/api/createApi.js";

let directory: string;
const app = () => createApi({ jwtSecret: "production-serving-test-secret-32-characters" });
beforeEach(() => {
  directory = mkdtempSync(path.join(tmpdir(), "promo-serving-"));
  mkdirSync(path.join(directory, "ui/dist/api"), { recursive: true });
  writeFileSync(path.join(directory, "ui/dist/index.html"), "<html>Promo UI</html>");
  writeFileSync(path.join(directory, "ui/dist/asset.js"), "/* static asset */");
  writeFileSync(path.join(directory, "ui/dist/api/unknown"), "must not be served");
  vi.spyOn(process, "cwd").mockReturnValue(directory);
  vi.stubEnv("NODE_ENV", "production");
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); rmSync(directory, { recursive: true, force: true }); });
describe("production serving", () => {
  it.each(["/", "/promos/example", "/apiary"])("serves SPA for %s", async (url) => {
    const response = await request(app()).get(url);
    expect(response.status).toBe(200);
    expect(response.text).toBe("<html>Promo UI</html>");
  });
  it("serves static assets", async () => {
    expect((await request(app()).get("/asset.js")).text).toBe("/* static asset */");
  });
  it.each(["/api", "/api/", "/api/unknown", "/API/unknown"])("keeps JSON 404 for %s", async (url) => {
    const response = await request(app()).get(url);
    expect(response.status).toBe(404);
    expect(response.body).toEqual({ error: "Маршрут не знайдено" });
  });
  it("preserves health and authentication", async () => {
    expect((await request(app()).get("/api/health")).body).toEqual({ status: "ok" });
    expect((await request(app()).get("/api/promos")).status).toBe(401);
  });
  it("does not turn POST requests into HTML successes", async () => {
    expect((await request(app()).post("/promos/example")).status).toBe(404);
  });
  it("does not serve UI in development", async () => {
    vi.stubEnv("NODE_ENV", "development");
    expect((await request(app()).get("/")).status).toBe(404);
  });
});
