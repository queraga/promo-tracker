CREATE TABLE "ReportingPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "year" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "lob" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "closedAt" DATETIME,
    "closedByUserId" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ReportingPeriod_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ReportingPeriod_year_quarter_lob_key" ON "ReportingPeriod"("year", "quarter", "lob");
CREATE INDEX "ReportingPeriod_status_year_quarter_idx" ON "ReportingPeriod"("status", "year", "quarter");
CREATE INDEX "ReportingPeriod_closedByUserId_idx" ON "ReportingPeriod"("closedByUserId");
