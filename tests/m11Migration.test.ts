import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const sql = (database: string, statement: string) => execFileSync("sqlite3", [database, statement], { encoding: "utf8" }).trim();

describe("M11 Promo.prolongedAt migration", () => {
  it("adds a nullable history marker without changing existing business data", () => {
    const directory = mkdtempSync(join(tmpdir(), "promo-tracker-m11-")); directories.push(directory);
    const database = join(directory, "representative.db");
    const prior = [
      "20260909112226_init", "20260910100000_add_report_reminder_state", "20260910140000_add_users",
      "20260921120000_add_kam_role_and_user_partners", "20260921190000_nullable_promo_partner_subject", "20260923100000_add_plm_role",
      "20260924100000_add_reporting_period",
    ].map((name) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")).join("\n");
    execFileSync("sqlite3", [database], { input: prior });
    sql(database, `
      INSERT INTO "Partner" ("id","name","updatedAt") VALUES ('p1','Rozetka','2026-09-01');
      INSERT INTO "Promo" ("id","lob","name","normalizedName","startDate","endDate","updatedAt") VALUES ('promo','AW','Watch','watch','2026-09-03','2026-09-28','2026-09-01');
      INSERT INTO "PromoPartner" ("id","promoId","partnerId","rawEmailSubject","reportReceived","reportReceivedAt","firstReminderSentAt","secondReminderSentAt","updatedAt") VALUES ('r1','promo','p1','source',1,'2026-09-29','2026-09-29','2026-09-30','2026-09-30');
    `);
    const before = sql(database, `SELECT p.id||p.lob||p.name||p.startDate||p.endDate||r.id||r.partnerId||r.rawEmailSubject||r.reportReceived||r.reportReceivedAt||r.firstReminderSentAt||r.secondReminderSentAt FROM Promo p JOIN PromoPartner r ON r.promoId=p.id;`);
    execFileSync("sqlite3", [database], { input: readFileSync("prisma/migrations/20260930110000_add_promo_prolonged_at/migration.sql", "utf8") });
    expect(sql(database, `SELECT p.id||p.lob||p.name||p.startDate||p.endDate||r.id||r.partnerId||r.rawEmailSubject||r.reportReceived||r.reportReceivedAt||r.firstReminderSentAt||r.secondReminderSentAt FROM Promo p JOIN PromoPartner r ON r.promoId=p.id;`)).toBe(before);
    expect(sql(database, `SELECT COUNT(*) FROM Promo WHERE prolongedAt IS NOT NULL;`)).toBe("0");
    expect(sql(database, `PRAGMA foreign_key_check;`)).toBe("");
  });
});
