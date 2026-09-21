import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { ManagedUser } from "../types";
import { DeleteUserAction, DeleteUserDialog, removeDeletedUser, userDeleteReducer, type UserDeleteState } from "./UserManagement";

const user = (role: ManagedUser["role"], id = 2): ManagedUser => ({ id, email: `${role.toLowerCase()}@example.com`, role, isActive: true, createdAt: "2026-09-01", updatedAt: "2026-09-01", partners: [] });
const initial: UserDeleteState = { target: null, busy: false };

describe("KAM deletion UI", () => {
  it("shows the delete action only for KAM", () => {
    expect(renderToStaticMarkup(<DeleteUserAction user={user("KAM")} onOpen={vi.fn()} />)).toContain("Видалити");
    expect(renderToStaticMarkup(<DeleteUserAction user={user("SUPERUSER")} onOpen={vi.fn()} />)).toBe("");
  });
  it("opens confirmation on the first action and identifies the account", () => {
    const opened = userDeleteReducer(initial, { type: "open", user: user("KAM") });
    const html = renderToStaticMarkup(<DeleteUserDialog state={opened} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(html).toContain("Видалити користувача?");
    expect(html).toContain("kam@example.com");
    expect(html).toContain("Це не видалить партнерів або промо.");
    expect(html).toContain("Скасувати");
  });
  it("cancel closes confirmation without changing the list", () => {
    const users = [user("KAM")];
    const opened = userDeleteReducer(initial, { type: "open", user: users[0] });
    expect(userDeleteReducer(opened, { type: "cancel" })).toEqual(initial);
    expect(users).toHaveLength(1);
  });
  it("successful deletion removes only the target and closes confirmation", () => {
    const kam = user("KAM", 2); const admin = user("SUPERUSER", 1);
    expect(removeDeletedUser([admin, kam], kam.id)).toEqual([admin]);
    expect(userDeleteReducer({ target: kam, busy: true }, { type: "success" })).toEqual(initial);
  });
  it("failure preserves the target and user list so the existing error UI can report it", () => {
    const kam = user("KAM"); const users = [kam];
    expect(userDeleteReducer({ target: kam, busy: true }, { type: "failure" })).toEqual({ target: kam, busy: false });
    expect(users).toEqual([kam]);
  });
});
