import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const sql = (database: string, statement: string) => execFileSync("sqlite3", [database, statement], { encoding: "utf8" }).trim();

describe("M8.8 nullable relation subject migration", () => {
  it("preserves existing relation data and permits a null manual subject", () => {
    const directory = mkdtempSync(join(tmpdir(), "promo-tracker-m88-")); directories.push(directory);
    const database = join(directory, "representative.db");
    const prior = [
      "prisma/migrations/20260909112226_init/migration.sql",
      "prisma/migrations/20260910100000_add_report_reminder_state/migration.sql",
      "prisma/migrations/20260910140000_add_users/migration.sql",
      "prisma/migrations/20260921120000_add_kam_role_and_user_partners/migration.sql",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    execFileSync("sqlite3", [database], { input: prior });
    sql(database, `
      INSERT INTO "Partner" ("id", "name", "updatedAt") VALUES ('p1', 'Kibernetiki', '2026-09-01'), ('p2', 'iSpace', '2026-09-01');
      INSERT INTO "Promo" ("id", "lob", "name", "normalizedName", "startDate", "endDate", "updatedAt") VALUES ('promo', 'ACCY', 'Neutral', 'neutral', '2026-09-01', '2026-09-02', '2026-09-01');
      INSERT INTO "PromoPartner" ("id", "promoId", "partnerId", "rawEmailSubject", "reportReceived", "reportReceivedAt", "firstReminderSentAt", "updatedAt") VALUES ('r1', 'promo', 'p1', 'real subject', 1, '2026-09-03', '2026-09-03', '2026-09-03');
    `);
    execFileSync("sqlite3", [database], { input: readFileSync("prisma/migrations/20260921190000_nullable_promo_partner_subject/migration.sql", "utf8") });
    sql(database, `INSERT INTO "PromoPartner" ("id", "promoId", "partnerId", "rawEmailSubject", "updatedAt") VALUES ('r2', 'promo', 'p2', NULL, '2026-09-03');`);
    expect(sql(database, `SELECT "rawEmailSubject" || '|' || "reportReceived" || '|' || "reportReceivedAt" || '|' || "firstReminderSentAt" FROM "PromoPartner" WHERE "id"='r1';`)).toBe("real subject|1|2026-09-03|2026-09-03");
    expect(sql(database, `SELECT "rawEmailSubject" IS NULL FROM "PromoPartner" WHERE "id"='r2';`)).toBe("1");
    expect(sql(database, `PRAGMA foreign_key_check;`)).toBe("");
  });
});
