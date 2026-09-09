-- CreateTable
CREATE TABLE "Promo" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "lob" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PromoPartner" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "promoId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "rawEmailSubject" TEXT NOT NULL,
    "reportReceived" BOOLEAN NOT NULL DEFAULT false,
    "reportReceivedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromoPartner_promoId_fkey" FOREIGN KEY ("promoId") REFERENCES "Promo" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PromoPartner_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Promo_startDate_idx" ON "Promo"("startDate");

-- CreateIndex
CREATE INDEX "Promo_endDate_idx" ON "Promo"("endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Promo_lob_normalizedName_startDate_endDate_key" ON "Promo"("lob", "normalizedName", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_name_key" ON "Partner"("name");

-- CreateIndex
CREATE INDEX "PromoPartner_partnerId_idx" ON "PromoPartner"("partnerId");

-- CreateIndex
CREATE INDEX "PromoPartner_promoId_idx" ON "PromoPartner"("promoId");

-- CreateIndex
CREATE UNIQUE INDEX "PromoPartner_promoId_partnerId_key" ON "PromoPartner"("promoId", "partnerId");
