PRAGMA foreign_keys=OFF;

CREATE TABLE "new_PromoPartner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "rawEmailSubject" TEXT,
    "reportReceived" BOOLEAN NOT NULL DEFAULT false,
    "reportReceivedAt" DATETIME,
    "firstReminderSentAt" DATETIME,
    "secondReminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromoPartner_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoPartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_PromoPartner" ("id", "promoId", "partnerId", "rawEmailSubject", "reportReceived", "reportReceivedAt", "firstReminderSentAt", "secondReminderSentAt", "createdAt", "updatedAt")
SELECT "id", "promoId", "partnerId", "rawEmailSubject", "reportReceived", "reportReceivedAt", "firstReminderSentAt", "secondReminderSentAt", "createdAt", "updatedAt"
FROM "PromoPartner";

DROP TABLE "PromoPartner";
ALTER TABLE "new_PromoPartner" RENAME TO "PromoPartner";
CREATE INDEX "PromoPartner_partnerId_idx" ON "PromoPartner"("partnerId");
CREATE INDEX "PromoPartner_promoId_idx" ON "PromoPartner"("promoId");
CREATE UNIQUE INDEX "PromoPartner_promoId_partnerId_key" ON "PromoPartner"("promoId", "partnerId");

PRAGMA foreign_keys=ON;
