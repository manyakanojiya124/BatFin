-- Governed, versioned CSV imports for Super-Admin business-data sections.

CREATE TABLE "MasterDataImportJob" (
  "id" TEXT NOT NULL,
  "datasetType" TEXT NOT NULL,
  "sourceFileName" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "sourceRowCount" INTEGER NOT NULL,
  "status" TEXT NOT NULL,
  "insertedCount" INTEGER NOT NULL DEFAULT 0,
  "updatedCount" INTEGER NOT NULL DEFAULT 0,
  "unchangedCount" INTEGER NOT NULL DEFAULT 0,
  "errorCount" INTEGER NOT NULL DEFAULT 0,
  "headers" JSONB NOT NULL,
  "validationIssues" JSONB,
  "reason" TEXT NOT NULL,
  "importedByAdminId" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MasterDataImportJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MasterDataRecordVersion" (
  "id" TEXT NOT NULL,
  "datasetType" TEXT NOT NULL,
  "businessKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "label" TEXT NOT NULL,
  "searchText" TEXT NOT NULL,
  "active" BOOLEAN,
  "payload" JSONB NOT NULL,
  "isCurrent" BOOLEAN NOT NULL DEFAULT true,
  "sourceRowNumber" INTEGER NOT NULL,
  "sourceImportJobId" TEXT NOT NULL,
  "importedByAdminId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "MasterDataRecordVersion_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MasterDataImportJob_datasetType_sourceHash_idx"
  ON "MasterDataImportJob"("datasetType", "sourceHash");
CREATE UNIQUE INDEX "MasterDataImportJob_completed_source_hash_key"
  ON "MasterDataImportJob"("datasetType", "sourceHash")
  WHERE "status" = 'completed';
CREATE INDEX "MasterDataImportJob_datasetType_createdAt_idx"
  ON "MasterDataImportJob"("datasetType", "createdAt");
CREATE INDEX "MasterDataImportJob_importedByAdminId_createdAt_idx"
  ON "MasterDataImportJob"("importedByAdminId", "createdAt");
CREATE INDEX "MasterDataImportJob_status_createdAt_idx"
  ON "MasterDataImportJob"("status", "createdAt");

CREATE UNIQUE INDEX "MasterDataRecordVersion_datasetType_businessKey_version_key"
  ON "MasterDataRecordVersion"("datasetType", "businessKey", "version");
CREATE UNIQUE INDEX "MasterDataRecordVersion_one_current_key"
  ON "MasterDataRecordVersion"("datasetType", "businessKey")
  WHERE "isCurrent" = true;
CREATE INDEX "MasterDataRecordVersion_datasetType_isCurrent_createdAt_idx"
  ON "MasterDataRecordVersion"("datasetType", "isCurrent", "createdAt");
CREATE INDEX "MasterDataRecordVersion_datasetType_active_isCurrent_idx"
  ON "MasterDataRecordVersion"("datasetType", "active", "isCurrent");
CREATE INDEX "MasterDataRecordVersion_sourceImportJobId_sourceRowNumber_idx"
  ON "MasterDataRecordVersion"("sourceImportJobId", "sourceRowNumber");
CREATE INDEX "MasterDataRecordVersion_importedByAdminId_createdAt_idx"
  ON "MasterDataRecordVersion"("importedByAdminId", "createdAt");

ALTER TABLE "MasterDataImportJob"
  ADD CONSTRAINT "MasterDataImportJob_importedByAdminId_fkey"
  FOREIGN KEY ("importedByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MasterDataRecordVersion"
  ADD CONSTRAINT "MasterDataRecordVersion_sourceImportJobId_fkey"
  FOREIGN KEY ("sourceImportJobId") REFERENCES "MasterDataImportJob"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "MasterDataRecordVersion"
  ADD CONSTRAINT "MasterDataRecordVersion_importedByAdminId_fkey"
  FOREIGN KEY ("importedByAdminId") REFERENCES "AdminUser"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "MasterDataImportJob"
  ADD CONSTRAINT "MasterDataImportJob_status_check"
    CHECK ("status" IN ('processing', 'completed', 'failed')),
  ADD CONSTRAINT "MasterDataImportJob_hash_check"
    CHECK ("sourceHash" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "MasterDataImportJob_counts_check"
    CHECK (
      "sourceRowCount" >= 0 AND "insertedCount" >= 0 AND
      "updatedCount" >= 0 AND "unchangedCount" >= 0 AND "errorCount" >= 0
    ),
  ADD CONSTRAINT "MasterDataImportJob_reason_check"
    CHECK (char_length("reason") BETWEEN 10 AND 500),
  ADD CONSTRAINT "MasterDataImportJob_completed_shape_check"
    CHECK (
      ("status" = 'completed' AND "completedAt" IS NOT NULL AND "errorCount" = 0)
      OR ("status" = 'processing' AND "completedAt" IS NULL)
      OR "status" = 'failed'
    );

ALTER TABLE "MasterDataRecordVersion"
  ADD CONSTRAINT "MasterDataRecordVersion_key_check"
    CHECK (char_length("businessKey") BETWEEN 1 AND 500),
  ADD CONSTRAINT "MasterDataRecordVersion_version_check"
    CHECK ("version" >= 1 AND "sourceRowNumber" >= 2),
  ADD CONSTRAINT "MasterDataRecordVersion_label_check"
    CHECK (char_length("label") BETWEEN 1 AND 500);
