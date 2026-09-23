import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
const sql = (database: string, statement: string) => execFileSync("sqlite3", [database, statement], { encoding: "utf8" }).trim();

describe("M10 ReportingPeriod migration", () => {
  it("preserves M9 business data and creates no historical periods", () => {
    const directory = mkdtempSync(join(tmpdir(), "promo-tracker-m10-")); directories.push(directory);
    const database = join(directory, "representative.db");
    const prior = [
      "20260909112226_init", "20260910100000_add_report_reminder_state", "20260910140000_add_users",
      "20260921120000_add_kam_role_and_user_partners", "20260921190000_nullable_promo_partner_subject", "20260923100000_add_plm_role",
    ].map((name) => readFileSync(`prisma/migrations/${name}/migration.sql`, "utf8")).join("\n");
    execFileSync("sqlite3", [database], { input: prior });
    sql(database, `
      INSERT INTO "User" ("id","email","passwordHash","role","updatedAt") VALUES (1,'plm@test','secret','PLM','2026-09-01'),(2,'kam@test','secret','KAM','2026-09-01');
      INSERT INTO "Partner" ("id","name","updatedAt") VALUES ('p1','Rozetka','2026-09-01');
      INSERT INTO "UserPartner" ("userId","partnerId") VALUES (2,'p1');
      INSERT INTO "Promo" ("id","lob","name","normalizedName","startDate","endDate","updatedAt") VALUES ('promo','iPhone','Neutral','neutral','2026-09-29','2026-10-05','2026-09-01');
      INSERT INTO "PromoPartner" ("id","promoId","partnerId","rawEmailSubject","reportReceived","reportReceivedAt","firstReminderSentAt","secondReminderSentAt","updatedAt") VALUES ('r1','promo','p1',NULL,1,'2026-10-07','2026-10-06','2026-10-07','2026-10-07');
    `);
    const before = sql(database, `SELECT (SELECT group_concat(id||lob||name||startDate||endDate) FROM Promo)||(SELECT group_concat(id||promoId||partnerId||ifnull(rawEmailSubject,'NULL')||reportReceived||reportReceivedAt||firstReminderSentAt||secondReminderSentAt) FROM PromoPartner)||(SELECT group_concat(id||email||role) FROM User)||(SELECT group_concat(userId||partnerId) FROM UserPartner);`);
    execFileSync("sqlite3", [database], { input: readFileSync("prisma/migrations/20260924100000_add_reporting_period/migration.sql", "utf8") });
    expect(sql(database, `SELECT (SELECT group_concat(id||lob||name||startDate||endDate) FROM Promo)||(SELECT group_concat(id||promoId||partnerId||ifnull(rawEmailSubject,'NULL')||reportReceived||reportReceivedAt||firstReminderSentAt||secondReminderSentAt) FROM PromoPartner)||(SELECT group_concat(id||email||role) FROM User)||(SELECT group_concat(userId||partnerId) FROM UserPartner);`)).toBe(before);
    expect(sql(database, `SELECT COUNT(*) FROM ReportingPeriod;`)).toBe("0");
    expect(sql(database, `PRAGMA foreign_key_check;`)).toBe("");
  });
});
