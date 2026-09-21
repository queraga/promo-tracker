import type { User } from "@prisma/client";
import request from "supertest";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createApi, type ApiDependencies } from "../src/api/createApi.js";
import { hashPassword } from "../src/features/auth/password.js";
import { LastActiveSuperuserError, toManagedUser } from "../src/features/auth/userAdmin.js";

const secret = "test-secret-that-is-at-least-32-characters";
const createdAt = new Date("2026-09-01T00:00:00Z");
let passwordHash = "";
beforeAll(async () => { passwordHash = await hashPassword("correct-password"); });
const makeUser = (role: User["role"], id: number): User => ({ id, email: `${role.toLowerCase()}-${id}@example.com`, passwordHash, role, isActive: true, createdAt, updatedAt: createdAt });

function dependencies(currentUser: User, overrides: Partial<ApiDependencies> = {}): Partial<ApiDependencies> {
  return {
    jwtSecret: secret,
    findUserByEmail: vi.fn().mockResolvedValue(currentUser),
    findUserById: vi.fn().mockResolvedValue(currentUser),
    listUsers: vi.fn().mockResolvedValue([toManagedUser(currentUser)]),
    createManagedUser: vi.fn(),
    updateManagedUser: vi.fn(),
    updateManagedUserPassword: vi.fn(),
    ...overrides,
  };
}

async function authenticatedAgent(user: User, overrides: Partial<ApiDependencies> = {}) {
  const agent = request.agent(createApi(dependencies(user, overrides)));
  expect((await agent.post("/api/auth/login").send({ email: user.email, password: "correct-password" })).status).toBe(200);
  return agent;
}

describe("user administration API", () => {
  it.each(["get", "post", "patch", "put"] as const)("rejects unauthenticated %s requests", async (method) => {
    const app = request(createApi(dependencies(makeUser("SUPERUSER", 1))));
    const response = method === "get" ? await app.get("/api/users") : method === "post" ? await app.post("/api/users").send({}) : method === "patch" ? await app.patch("/api/users/2").send({ role: "KAM" }) : await app.put("/api/users/2/password").send({ password: "new-password" });
    expect(response.status).toBe(401);
  });

  it("prevents KAM from listing users", async () => expect((await (await authenticatedAgent(makeUser("KAM", 1))).get("/api/users")).status).toBe(403));
  it("rechecks a changed role on an existing session", async () => {
    const admin = makeUser("SUPERUSER", 1);
    const agent = await authenticatedAgent(admin);
    admin.role = "KAM";
    expect((await agent.get("/api/users")).status).toBe(403);
  });
  it("allows SUPERUSER to list safe user records", async () => {
    const admin = makeUser("SUPERUSER", 1);
    const response = await (await authenticatedAgent(admin)).get("/api/users");
    expect(response.status).toBe(200);
    expect(response.body[0]).toMatchObject({ id: 1, email: admin.email, role: "SUPERUSER", isActive: true });
    expect(JSON.stringify(response.body)).not.toContain("passwordHash");
  });
  it("creates a user with a normalized service payload", async () => {
    const created = toManagedUser(makeUser("KAM", 2));
    const create = vi.fn().mockResolvedValue(created);
    const agent = await authenticatedAgent(makeUser("SUPERUSER", 1), { createManagedUser: create });
    const response = await agent.post("/api/users").send({ email: "new@example.com", password: "strong-password", role: "KAM" });
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith("new@example.com", "strong-password", "KAM");
    expect(response.body).not.toHaveProperty("passwordHash");
  });
  it("updates role and active state", async () => {
    const updated = { ...toManagedUser(makeUser("SUPERUSER", 2)), role: "KAM" as const, isActive: false };
    const update = vi.fn().mockResolvedValue(updated);
    const agent = await authenticatedAgent(makeUser("SUPERUSER", 1), { updateManagedUser: update });
    const response = await agent.patch("/api/users/2").send({ role: "KAM", isActive: false });
    expect(response.status).toBe(200);
    expect(update).toHaveBeenCalledWith(2, { role: "KAM", isActive: false });
  });
  it("resets a password", async () => {
    const reset = vi.fn().mockResolvedValue(true);
    const agent = await authenticatedAgent(makeUser("SUPERUSER", 1), { updateManagedUserPassword: reset });
    expect((await agent.put("/api/users/2/password").send({ password: "new-password" })).status).toBe(200);
    expect(reset).toHaveBeenCalledWith(2, "new-password");
  });
  it("rejects removing the last active SUPERUSER", async () => {
    const update = vi.fn().mockRejectedValue(new LastActiveSuperuserError());
    const agent = await authenticatedAgent(makeUser("SUPERUSER", 1), { updateManagedUser: update });
    const response = await agent.patch("/api/users/1").send({ isActive: false });
    expect(response.status).toBe(409);
  });
  it.each([
    ["patch", "/api/users/nope", { role: "KAM" }],
    ["patch", "/api/users/2", { role: "ADMIN" }],
    ["patch", "/api/users/2", {}],
    ["put", "/api/users/2/password", {}],
  ])("validates %s %s", async (method, path, body) => {
    const agent = await authenticatedAgent(makeUser("SUPERUSER", 1));
    const response = method === "patch" ? await agent.patch(path).send(body) : await agent.put(path).send(body);
    expect(response.status).toBe(400);
  });
});
