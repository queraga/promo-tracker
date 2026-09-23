import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const sql = (database: string, statement: string) => execFileSync("sqlite3", [database, statement], { encoding: "utf8" }).trim();

describe("M9 PLM role migration", () => {
  it("adds no SQLite data rewrite and preserves every M8.8 business record", () => {
    const directory = mkdtempSync(join(tmpdir(), "promo-tracker-m9-")); directories.push(directory);
    const database = join(directory, "representative.db");
    const prior = [
      "prisma/migrations/20260909112226_init/migration.sql",
      "prisma/migrations/20260910100000_add_report_reminder_state/migration.sql",
      "prisma/migrations/20260910140000_add_users/migration.sql",
      "prisma/migrations/20260921120000_add_kam_role_and_user_partners/migration.sql",
      "prisma/migrations/20260921190000_nullable_promo_partner_subject/migration.sql",
    ].map((path) => readFileSync(path, "utf8")).join("\n");
    execFileSync("sqlite3", [database], { input: prior });
    sql(database, `
      INSERT INTO "User" ("id","email","passwordHash","role","updatedAt") VALUES (1,'admin@test','a','SUPERUSER','2026-09-01'),(2,'kam@test','k','KAM','2026-09-01');
      INSERT INTO "Partner" ("id","name","updatedAt") VALUES ('p1','Rozetka','2026-09-01');
      INSERT INTO "UserPartner" ("userId","partnerId") VALUES (2,'p1');
      INSERT INTO "Promo" ("id","lob","name","normalizedName","startDate","endDate","updatedAt") VALUES ('promo','ACCY','Neutral','neutral','2026-09-01','2026-09-02','2026-09-01');
      INSERT INTO "PromoPartner" ("id","promoId","partnerId","rawEmailSubject","reportReceived","reportReceivedAt","firstReminderSentAt","secondReminderSentAt","updatedAt") VALUES ('r1','promo','p1',NULL,1,'2026-09-03','2026-09-03','2026-09-04','2026-09-04');
    `);
    const before = sql(database, `SELECT (SELECT COUNT(*) FROM "User")||'|'||(SELECT COUNT(*) FROM "UserPartner")||'|'||(SELECT COUNT(*) FROM "Partner")||'|'||(SELECT COUNT(*) FROM "Promo")||'|'||(SELECT COUNT(*) FROM "PromoPartner")||'|'||(SELECT role FROM "User" WHERE id=2)||'|'||(SELECT rawEmailSubject IS NULL FROM "PromoPartner")||'|'||(SELECT reportReceived FROM "PromoPartner")||'|'||(SELECT firstReminderSentAt FROM "PromoPartner")||'|'||(SELECT secondReminderSentAt FROM "PromoPartner");`);
    execFileSync("sqlite3", [database], { input: readFileSync("prisma/migrations/20260923100000_add_plm_role/migration.sql", "utf8") });
    expect(sql(database, `SELECT (SELECT COUNT(*) FROM "User")||'|'||(SELECT COUNT(*) FROM "UserPartner")||'|'||(SELECT COUNT(*) FROM "Partner")||'|'||(SELECT COUNT(*) FROM "Promo")||'|'||(SELECT COUNT(*) FROM "PromoPartner")||'|'||(SELECT role FROM "User" WHERE id=2)||'|'||(SELECT rawEmailSubject IS NULL FROM "PromoPartner")||'|'||(SELECT reportReceived FROM "PromoPartner")||'|'||(SELECT firstReminderSentAt FROM "PromoPartner")||'|'||(SELECT secondReminderSentAt FROM "PromoPartner");`)).toBe(before);
    sql(database, `INSERT INTO "User" ("email","passwordHash","role","updatedAt") VALUES ('plm@test','p','PLM','2026-09-01');`);
    expect(sql(database, `SELECT role FROM "User" WHERE email='plm@test';`)).toBe("PLM");
    expect(sql(database, `PRAGMA foreign_key_check;`)).toBe("");
  });
});
