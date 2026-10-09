CREATE TABLE "PromoProlongationOperation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fingerprint" TEXT NOT NULL,
    "sourcePromoId" TEXT NOT NULL,
    "sourceLob" TEXT NOT NULL,
    "sourceEndDate" DATETIME NOT NULL,
    "requestedEndDate" DATETIME NOT NULL,
    "resultKind" TEXT NOT NULL,
    "resultTargetPromoId" TEXT NOT NULL,
    "resultContinuationPromoId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE "PromoProlongationAssociationSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "operationId" TEXT NOT NULL,
    "sourcePromoPartnerId" TEXT NOT NULL,
    "partnerId" TEXT NOT NULL,
    "rawEmailSubject" TEXT,
    "reportReceived" BOOLEAN NOT NULL,
    "reportReceivedAt" DATETIME,
    "firstReminderSentAt" DATETIME,
    "secondReminderSentAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PromoProlongationAssociationSnapshot_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "PromoProlongationOperation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PromoProlongationOperation_fingerprint_key" ON "PromoProlongationOperation"("fingerprint");
CREATE INDEX "PromoProlongationOperation_sourcePromoId_requestedEndDate_idx" ON "PromoProlongationOperation"("sourcePromoId", "requestedEndDate");
CREATE UNIQUE INDEX "PromoProlongationAssociationSnapshot_operationId_sourcePromoPartnerId_key" ON "PromoProlongationAssociationSnapshot"("operationId", "sourcePromoPartnerId");
CREATE INDEX "PromoProlongationAssociationSnapshot_sourcePromoPartnerId_idx" ON "PromoProlongationAssociationSnapshot"("sourcePromoPartnerId");
