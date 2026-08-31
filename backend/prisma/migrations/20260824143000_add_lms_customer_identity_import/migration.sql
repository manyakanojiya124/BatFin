ALTER TABLE "PortfolioAccount"
  ADD COLUMN "sourceApplicationNumber" TEXT,
  ADD COLUMN "globalCustomerId" TEXT,
  ADD COLUMN "lmsCustomerId" TEXT;

CREATE INDEX "PortfolioAccount_globalCustomerId_idx" ON "PortfolioAccount"("globalCustomerId");
CREATE INDEX "PortfolioAccount_lmsCustomerId_idx" ON "PortfolioAccount"("lmsCustomerId");

CREATE TABLE "CustomerIdentityImportJob" (
  "id" TEXT NOT NULL,
  "importedByAdminId" TEXT,
  "sourceFileName" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sourceRowCount" INTEGER NOT NULL,
  "validIdentityCount" INTEGER NOT NULL,
  "createdUserCount" INTEGER NOT NULL DEFAULT 0,
  "existingUserCount" INTEGER NOT NULL DEFAULT 0,
  "linkedAccountCount" INTEGER NOT NULL DEFAULT 0,
  "unmatchedLoanCount" INTEGER NOT NULL DEFAULT 0,
  "conflictCount" INTEGER NOT NULL DEFAULT 0,
  "warnings" JSONB NOT NULL,
  "errors" JSONB NOT NULL,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerIdentityImportJob_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CustomerIdentityImportJob_sourceHash_key" ON "CustomerIdentityImportJob"("sourceHash");
CREATE INDEX "CustomerIdentityImportJob_status_createdAt_idx" ON "CustomerIdentityImportJob"("status", "createdAt");
CREATE INDEX "CustomerIdentityImportJob_importedByAdminId_createdAt_idx" ON "CustomerIdentityImportJob"("importedByAdminId", "createdAt");
ALTER TABLE "CustomerIdentityImportJob" ADD CONSTRAINT "CustomerIdentityImportJob_importedByAdminId_fkey" FOREIGN KEY ("importedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "CustomerIdentityImportJob" ADD CONSTRAINT "CustomerIdentityImportJob_counts_check" CHECK ("sourceRowCount" >= 0 AND "validIdentityCount" >= 0 AND "createdUserCount" >= 0 AND "existingUserCount" >= 0 AND "linkedAccountCount" >= 0 AND "unmatchedLoanCount" >= 0 AND "conflictCount" >= 0);
