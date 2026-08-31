ALTER TABLE "User"
  ADD COLUMN "lastLoginAt" TIMESTAMP(3),
  ADD COLUMN "lastActivityAt" TIMESTAMP(3);

CREATE TABLE "Dealer" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "normalizedName" TEXT NOT NULL,
  "homeState" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Dealer_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioAccount" (
  "id" TEXT NOT NULL,
  "customerLoanId" TEXT NOT NULL,
  "customerName" TEXT NOT NULL,
  "normalizedCustomerName" TEXT NOT NULL,
  "userId" TEXT,
  "portfolioStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
  "linkedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioImportJob" (
  "id" TEXT NOT NULL,
  "importedByAdminId" TEXT,
  "sourceFileName" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "fileType" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "sourceRowCount" INTEGER NOT NULL,
  "normalizedRowCount" INTEGER NOT NULL,
  "insertedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "archivedCount" INTEGER NOT NULL DEFAULT 0,
  "accountCount" INTEGER NOT NULL DEFAULT 0,
  "dealerCount" INTEGER NOT NULL DEFAULT 0,
  "warnings" JSONB NOT NULL,
  "errors" JSONB NOT NULL,
  "reconciliation" JSONB,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PortfolioImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PortfolioCase" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "dealerId" TEXT NOT NULL,
  "sourceImportId" TEXT NOT NULL,
  "caseKey" TEXT NOT NULL,
  "sourceRowNumber" INTEGER NOT NULL,
  "caseOrdinal" INTEGER NOT NULL,
  "sourceFingerprint" TEXT NOT NULL,
  "batteryNo" TEXT,
  "batteryIsPlaceholder" BOOLEAN NOT NULL DEFAULT false,
  "dealerHomeState" TEXT,
  "deploymentState" TEXT NOT NULL,
  "caseStatus" TEXT NOT NULL,
  "bucket" TEXT NOT NULL,
  "disburseDate" DATE NOT NULL,
  "vintageMonth" DATE NOT NULL,
  "closedDate" DATE,
  "tenureMonths" INTEGER NOT NULL,
  "emi" DECIMAL(14,2) NOT NULL,
  "dpAmount" DECIMAL(14,2) NOT NULL,
  "contractedDemand" DECIMAL(14,2) NOT NULL,
  "billedToDate" DECIMAL(14,2) NOT NULL,
  "futureDemand" DECIMAL(14,2) NOT NULL,
  "delinquent" BOOLEAN NOT NULL DEFAULT false,
  "npaRepo" BOOLEAN NOT NULL DEFAULT false,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "archivedAt" TIMESTAMP(3),
  "sourceData" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PortfolioCase_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CustomerActivity" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "eventType" TEXT NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CustomerActivity_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Dealer_normalizedName_key" ON "Dealer"("normalizedName");
CREATE INDEX "Dealer_homeState_name_idx" ON "Dealer"("homeState", "name");
CREATE UNIQUE INDEX "PortfolioAccount_customerLoanId_key" ON "PortfolioAccount"("customerLoanId");
CREATE INDEX "PortfolioAccount_userId_updatedAt_idx" ON "PortfolioAccount"("userId", "updatedAt");
CREATE INDEX "PortfolioAccount_portfolioStatus_createdAt_idx" ON "PortfolioAccount"("portfolioStatus", "createdAt");
CREATE INDEX "PortfolioAccount_normalizedCustomerName_idx" ON "PortfolioAccount"("normalizedCustomerName");
CREATE UNIQUE INDEX "PortfolioImportJob_sourceHash_key" ON "PortfolioImportJob"("sourceHash");
CREATE INDEX "PortfolioImportJob_status_createdAt_idx" ON "PortfolioImportJob"("status", "createdAt");
CREATE INDEX "PortfolioImportJob_importedByAdminId_createdAt_idx" ON "PortfolioImportJob"("importedByAdminId", "createdAt");
CREATE UNIQUE INDEX "PortfolioCase_caseKey_key" ON "PortfolioCase"("caseKey");
CREATE UNIQUE INDEX "PortfolioCase_accountId_caseOrdinal_key" ON "PortfolioCase"("accountId", "caseOrdinal");
CREATE INDEX "PortfolioCase_accountId_isCurrent_disburseDate_idx" ON "PortfolioCase"("accountId", "isCurrent", "disburseDate");
CREATE INDEX "PortfolioCase_dealerId_isCurrent_caseStatus_idx" ON "PortfolioCase"("dealerId", "isCurrent", "caseStatus");
CREATE INDEX "PortfolioCase_caseStatus_isCurrent_disburseDate_idx" ON "PortfolioCase"("caseStatus", "isCurrent", "disburseDate");
CREATE INDEX "PortfolioCase_bucket_isCurrent_disburseDate_idx" ON "PortfolioCase"("bucket", "isCurrent", "disburseDate");
CREATE INDEX "PortfolioCase_deploymentState_isCurrent_idx" ON "PortfolioCase"("deploymentState", "isCurrent");
CREATE INDEX "PortfolioCase_batteryNo_isCurrent_idx" ON "PortfolioCase"("batteryNo", "isCurrent");
CREATE INDEX "PortfolioCase_delinquent_npaRepo_isCurrent_idx" ON "PortfolioCase"("delinquent", "npaRepo", "isCurrent");
CREATE INDEX "PortfolioCase_sourceImportId_idx" ON "PortfolioCase"("sourceImportId");
CREATE INDEX "CustomerActivity_userId_createdAt_idx" ON "CustomerActivity"("userId", "createdAt");
CREATE INDEX "CustomerActivity_eventType_createdAt_idx" ON "CustomerActivity"("eventType", "createdAt");
CREATE INDEX "User_lastActivityAt_idx" ON "User"("lastActivityAt");

ALTER TABLE "PortfolioAccount" ADD CONSTRAINT "PortfolioAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioImportJob" ADD CONSTRAINT "PortfolioImportJob_importedByAdminId_fkey" FOREIGN KEY ("importedByAdminId") REFERENCES "AdminUser"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PortfolioCase" ADD CONSTRAINT "PortfolioCase_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "PortfolioAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PortfolioCase" ADD CONSTRAINT "PortfolioCase_dealerId_fkey" FOREIGN KEY ("dealerId") REFERENCES "Dealer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PortfolioCase" ADD CONSTRAINT "PortfolioCase_sourceImportId_fkey" FOREIGN KEY ("sourceImportId") REFERENCES "PortfolioImportJob"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CustomerActivity" ADD CONSTRAINT "CustomerActivity_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PortfolioCase" ADD CONSTRAINT "PortfolioCase_tenure_check" CHECK ("tenureMonths" > 0 AND "tenureMonths" <= 120);
ALTER TABLE "PortfolioCase" ADD CONSTRAINT "PortfolioCase_amounts_check" CHECK ("emi" >= 0 AND "dpAmount" >= 0 AND "contractedDemand" >= 0 AND "billedToDate" >= 0);
ALTER TABLE "PortfolioImportJob" ADD CONSTRAINT "PortfolioImportJob_counts_check" CHECK ("sourceRowCount" >= 0 AND "normalizedRowCount" >= 0 AND "insertedCount" >= 0 AND "updatedCount" >= 0 AND "unchangedCount" >= 0 AND "archivedCount" >= 0);
