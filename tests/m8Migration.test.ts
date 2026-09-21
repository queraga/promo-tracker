import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const temporaryDirectories: string[] = [];
afterEach(() => { for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const sql = (database: string, statement: string) => execFileSync("sqlite3", [database, statement], { encoding: "utf8" }).trim();

describe("M8.1 SQLite migration", () => {
  it("preserves existing data, converts USER to KAM, and creates no assignments", () => {
    const directory = mkdtempSync(join(tmpdir(), "promo-tracker-m8-"));
    temporaryDirectories.push(directory);
    const database = join(directory, "representative.db");
    const migrations = [
      "prisma/migrations/20260909112226_init/migration.sql",
      "prisma/migrations/20260910100000_add_report_reminder_state/migration.sql",
      "prisma/migrations/20260910140000_add_users/migration.sql",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    execFileSync("sqlite3", [database], { input: migrations });
    sql(database, `
      INSERT INTO "User" ("id", "email", "passwordHash", "role", "isActive", "createdAt", "updatedAt") VALUES
        (1, 'kam@example.com', 'preserved-kam-hash', 'USER', 1, '2026-09-01', '2026-09-02'),
        (2, 'admin@example.com', 'preserved-admin-hash', 'SUPERUSER', 1, '2026-09-01', '2026-09-02');
      INSERT INTO "Partner" ("id", "name", "updatedAt") VALUES ('partner-1', 'Rozetka', '2026-09-02');
      INSERT INTO "Promo" ("id", "lob", "name", "normalizedName", "startDate", "endDate", "updatedAt") VALUES
        ('promo-1', 'ACCY', 'Promo', 'promo', '2026-09-25', '2026-09-27', '2026-09-02');
      INSERT INTO "PromoPartner" ("id", "promoId", "partnerId", "rawEmailSubject", "updatedAt") VALUES
        ('relation-1', 'promo-1', 'partner-1', 'subject', '2026-09-02');
    `);

    const before = sql(database, `SELECT (SELECT COUNT(*) FROM "User") || ',' || (SELECT COUNT(*) FROM "Partner") || ',' || (SELECT COUNT(*) FROM "Promo") || ',' || (SELECT COUNT(*) FROM "PromoPartner");`);
    execFileSync("sqlite3", [database], { input: readFileSync("prisma/migrations/20260921120000_add_kam_role_and_user_partners/migration.sql", "utf8") });
    const after = sql(database, `SELECT (SELECT COUNT(*) FROM "User") || ',' || (SELECT COUNT(*) FROM "Partner") || ',' || (SELECT COUNT(*) FROM "Promo") || ',' || (SELECT COUNT(*) FROM "PromoPartner");`);

    expect(before).toBe("2,1,1,1");
    expect(after).toBe(before);
    expect(sql(database, `SELECT COUNT(*) FROM "User" WHERE "role" = 'USER';`)).toBe("0");
    expect(sql(database, `SELECT COUNT(*) FROM "User" WHERE "role" = 'KAM';`)).toBe("1");
    expect(sql(database, `SELECT COUNT(*) FROM "UserPartner";`)).toBe("0");
    expect(sql(database, `SELECT group_concat("passwordHash", ',') FROM "User" ORDER BY "id";`)).toBe("preserved-kam-hash,preserved-admin-hash");
    expect(sql(database, `PRAGMA foreign_key_check;`)).toBe("");
  });
});
