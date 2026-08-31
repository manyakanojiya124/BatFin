-- CreateTable
CREATE TABLE "AnalyticsDataset" (
    "id" TEXT NOT NULL,
    "ownerAdminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'UPLOADING',
    "processingStage" TEXT NOT NULL DEFAULT 'UPLOAD',
    "processingMessage" TEXT,
    "activeSheetId" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "columnCount" INTEGER NOT NULL DEFAULT 0,
    "datasetVersion" INTEGER NOT NULL DEFAULT 1,
    "semanticModelVersion" INTEGER NOT NULL DEFAULT 0,
    "processingAttempt" INTEGER NOT NULL DEFAULT 0,
    "processingStartedAt" TIMESTAMP(3),
    "processingHeartbeatAt" TIMESTAMP(3),
    "lastAnalyzedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDatasetFile" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "originalFileName" TEXT NOT NULL,
    "safeFileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageProvider" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'STORED',
    "isCurrent" BOOLEAN NOT NULL DEFAULT true,
    "sheetCount" INTEGER NOT NULL DEFAULT 0,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDatasetFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDatasetSheet" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sheetIndex" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DISCOVERED',
    "sourceRowCount" INTEGER NOT NULL DEFAULT 0,
    "normalizedRowCount" INTEGER NOT NULL DEFAULT 0,
    "columnCount" INTEGER NOT NULL DEFAULT 0,
    "detectedHeaderRow" INTEGER,
    "dataStartRow" INTEGER,
    "recommendedAsPrimary" BOOLEAN NOT NULL DEFAULT false,
    "recommendationScore" DECIMAL(7,6),
    "recommendationReason" TEXT,
    "metadata" JSONB,
    "sampleRows" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDatasetSheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDatasetColumn" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "originalName" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "semanticType" TEXT NOT NULL DEFAULT 'UNKNOWN',
    "nullable" BOOLEAN NOT NULL DEFAULT true,
    "uniqueCount" INTEGER NOT NULL DEFAULT 0,
    "nullCount" INTEGER NOT NULL DEFAULT 0,
    "nullPercentage" DECIMAL(7,4) NOT NULL DEFAULT 0,
    "minValue" TEXT,
    "maxValue" TEXT,
    "averageValue" DECIMAL(30,8),
    "sampleValues" JSONB NOT NULL,
    "statistics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDatasetColumn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDatasetRow" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "datasetVersion" INTEGER NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDatasetRow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDatasetProfile" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sheetId" TEXT NOT NULL,
    "datasetVersion" INTEGER NOT NULL,
    "rowCount" INTEGER NOT NULL,
    "columnCount" INTEGER NOT NULL,
    "duplicateRowCount" INTEGER NOT NULL DEFAULT 0,
    "profile" JSONB NOT NULL,
    "sampleRows" JSONB NOT NULL,
    "dataQualityWarnings" JSONB NOT NULL,
    "detectedDateRanges" JSONB,
    "detectedRelationships" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDatasetProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsProcessingEvent" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsProcessingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsSemanticModel" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "datasetVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "provider" TEXT,
    "providerModel" TEXT,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "semanticModel" JSONB NOT NULL,
    "analysisResult" JSONB NOT NULL,
    "validationWarnings" JSONB,
    "generatedByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsSemanticModel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDashboard" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "ownerAdminId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "currentVersionId" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalyticsDashboard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDashboardVersion" (
    "id" TEXT NOT NULL,
    "dashboardId" TEXT NOT NULL,
    "semanticModelId" TEXT,
    "datasetVersion" INTEGER NOT NULL,
    "version" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "specification" JSONB NOT NULL,
    "filterState" JSONB NOT NULL,
    "layoutState" JSONB NOT NULL,
    "visualizationState" JSONB NOT NULL,
    "insightState" JSONB NOT NULL,
    "visualizationCount" INTEGER NOT NULL DEFAULT 0,
    "changeSummary" TEXT,
    "aiProvider" TEXT,
    "aiProviderModel" TEXT,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDashboardVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDashboardVisualization" (
    "id" TEXT NOT NULL,
    "dashboardVersionId" TEXT NOT NULL,
    "widgetKey" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dimensionField" TEXT,
    "measureField" TEXT,
    "aggregation" TEXT,
    "configuration" JSONB NOT NULL,
    "layout" JSONB NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDashboardVisualization_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDashboardFilter" (
    "id" TEXT NOT NULL,
    "dashboardVersionId" TEXT NOT NULL,
    "filterKey" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "operator" TEXT,
    "configuration" JSONB NOT NULL,
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDashboardFilter_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyticsDashboardInsight" (
    "id" TEXT NOT NULL,
    "dashboardVersionId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "evidence" JSONB,
    "confidence" DECIMAL(5,4),
    "sortOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsDashboardInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnalyticsDataset_ownerAdminId_deletedAt_updatedAt_idx" ON "AnalyticsDataset"("ownerAdminId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AnalyticsDataset_ownerAdminId_status_createdAt_idx" ON "AnalyticsDataset"("ownerAdminId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsDataset_status_processingHeartbeatAt_idx" ON "AnalyticsDataset"("status", "processingHeartbeatAt");

-- CreateIndex
CREATE INDEX "AnalyticsDataset_activeSheetId_idx" ON "AnalyticsDataset"("activeSheetId");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetFile_storageKey_key" ON "AnalyticsDatasetFile"("storageKey");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetFile_datasetId_isCurrent_createdAt_idx" ON "AnalyticsDatasetFile"("datasetId", "isCurrent", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetFile_sha256_idx" ON "AnalyticsDatasetFile"("sha256");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetFile_status_createdAt_idx" ON "AnalyticsDatasetFile"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetFile_datasetId_version_key" ON "AnalyticsDatasetFile"("datasetId", "version");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetSheet_datasetId_sheetIndex_idx" ON "AnalyticsDatasetSheet"("datasetId", "sheetIndex");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetSheet_datasetId_recommendedAsPrimary_idx" ON "AnalyticsDatasetSheet"("datasetId", "recommendedAsPrimary");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetSheet_status_createdAt_idx" ON "AnalyticsDatasetSheet"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetSheet_fileId_sheetIndex_key" ON "AnalyticsDatasetSheet"("fileId", "sheetIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetSheet_fileId_name_key" ON "AnalyticsDatasetSheet"("fileId", "name");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetColumn_datasetId_semanticType_idx" ON "AnalyticsDatasetColumn"("datasetId", "semanticType");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetColumn_datasetId_dataType_idx" ON "AnalyticsDatasetColumn"("datasetId", "dataType");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetColumn_sheetId_normalizedName_key" ON "AnalyticsDatasetColumn"("sheetId", "normalizedName");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetColumn_sheetId_ordinal_key" ON "AnalyticsDatasetColumn"("sheetId", "ordinal");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetRow_datasetId_datasetVersion_rowNumber_idx" ON "AnalyticsDatasetRow"("datasetId", "datasetVersion", "rowNumber");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetRow_sheetId_rowNumber_idx" ON "AnalyticsDatasetRow"("sheetId", "rowNumber");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetRow_sheetId_datasetVersion_rowNumber_key" ON "AnalyticsDatasetRow"("sheetId", "datasetVersion", "rowNumber");

-- CreateIndex
CREATE INDEX "AnalyticsDatasetProfile_datasetId_createdAt_idx" ON "AnalyticsDatasetProfile"("datasetId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDatasetProfile_datasetId_datasetVersion_sheetId_key" ON "AnalyticsDatasetProfile"("datasetId", "datasetVersion", "sheetId");

-- CreateIndex
CREATE INDEX "AnalyticsProcessingEvent_datasetId_createdAt_idx" ON "AnalyticsProcessingEvent"("datasetId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsProcessingEvent_stage_status_createdAt_idx" ON "AnalyticsProcessingEvent"("stage", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsProcessingEvent_datasetId_sequence_key" ON "AnalyticsProcessingEvent"("datasetId", "sequence");

-- CreateIndex
CREATE INDEX "AnalyticsSemanticModel_datasetId_datasetVersion_createdAt_idx" ON "AnalyticsSemanticModel"("datasetId", "datasetVersion", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsSemanticModel_generatedByAdminId_createdAt_idx" ON "AnalyticsSemanticModel"("generatedByAdminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsSemanticModel_datasetId_version_key" ON "AnalyticsSemanticModel"("datasetId", "version");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDashboard_currentVersionId_key" ON "AnalyticsDashboard"("currentVersionId");

-- CreateIndex
CREATE INDEX "AnalyticsDashboard_ownerAdminId_deletedAt_updatedAt_idx" ON "AnalyticsDashboard"("ownerAdminId", "deletedAt", "updatedAt");

-- CreateIndex
CREATE INDEX "AnalyticsDashboard_datasetId_status_updatedAt_idx" ON "AnalyticsDashboard"("datasetId", "status", "updatedAt");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardVersion_dashboardId_createdAt_idx" ON "AnalyticsDashboardVersion"("dashboardId", "createdAt");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardVersion_semanticModelId_idx" ON "AnalyticsDashboardVersion"("semanticModelId");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardVersion_createdByAdminId_createdAt_idx" ON "AnalyticsDashboardVersion"("createdByAdminId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDashboardVersion_dashboardId_version_key" ON "AnalyticsDashboardVersion"("dashboardId", "version");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardVisualization_dashboardVersionId_sortOrde_idx" ON "AnalyticsDashboardVisualization"("dashboardVersionId", "sortOrder");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardVisualization_type_createdAt_idx" ON "AnalyticsDashboardVisualization"("type", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDashboardVisualization_dashboardVersionId_widgetKe_key" ON "AnalyticsDashboardVisualization"("dashboardVersionId", "widgetKey");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardFilter_dashboardVersionId_sortOrder_idx" ON "AnalyticsDashboardFilter"("dashboardVersionId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyticsDashboardFilter_dashboardVersionId_filterKey_key" ON "AnalyticsDashboardFilter"("dashboardVersionId", "filterKey");

-- CreateIndex
CREATE INDEX "AnalyticsDashboardInsight_dashboardVersionId_sortOrder_idx" ON "AnalyticsDashboardInsight"("dashboardVersionId", "sortOrder");

-- AddForeignKey
ALTER TABLE "AnalyticsDataset" ADD CONSTRAINT "AnalyticsDataset_ownerAdminId_fkey" FOREIGN KEY ("ownerAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDataset" ADD CONSTRAINT "AnalyticsDataset_activeSheetId_fkey" FOREIGN KEY ("activeSheetId") REFERENCES "AnalyticsDatasetSheet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetFile" ADD CONSTRAINT "AnalyticsDatasetFile_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetSheet" ADD CONSTRAINT "AnalyticsDatasetSheet_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetSheet" ADD CONSTRAINT "AnalyticsDatasetSheet_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "AnalyticsDatasetFile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetColumn" ADD CONSTRAINT "AnalyticsDatasetColumn_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetColumn" ADD CONSTRAINT "AnalyticsDatasetColumn_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AnalyticsDatasetSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetRow" ADD CONSTRAINT "AnalyticsDatasetRow_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetRow" ADD CONSTRAINT "AnalyticsDatasetRow_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AnalyticsDatasetSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetProfile" ADD CONSTRAINT "AnalyticsDatasetProfile_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDatasetProfile" ADD CONSTRAINT "AnalyticsDatasetProfile_sheetId_fkey" FOREIGN KEY ("sheetId") REFERENCES "AnalyticsDatasetSheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsProcessingEvent" ADD CONSTRAINT "AnalyticsProcessingEvent_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSemanticModel" ADD CONSTRAINT "AnalyticsSemanticModel_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsSemanticModel" ADD CONSTRAINT "AnalyticsSemanticModel_generatedByAdminId_fkey" FOREIGN KEY ("generatedByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboard" ADD CONSTRAINT "AnalyticsDashboard_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "AnalyticsDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboard" ADD CONSTRAINT "AnalyticsDashboard_ownerAdminId_fkey" FOREIGN KEY ("ownerAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboard" ADD CONSTRAINT "AnalyticsDashboard_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "AnalyticsDashboardVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboardVersion" ADD CONSTRAINT "AnalyticsDashboardVersion_dashboardId_fkey" FOREIGN KEY ("dashboardId") REFERENCES "AnalyticsDashboard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboardVersion" ADD CONSTRAINT "AnalyticsDashboardVersion_semanticModelId_fkey" FOREIGN KEY ("semanticModelId") REFERENCES "AnalyticsSemanticModel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboardVersion" ADD CONSTRAINT "AnalyticsDashboardVersion_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "AdminUser"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboardVisualization" ADD CONSTRAINT "AnalyticsDashboardVisualization_dashboardVersionId_fkey" FOREIGN KEY ("dashboardVersionId") REFERENCES "AnalyticsDashboardVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboardFilter" ADD CONSTRAINT "AnalyticsDashboardFilter_dashboardVersionId_fkey" FOREIGN KEY ("dashboardVersionId") REFERENCES "AnalyticsDashboardVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsDashboardInsight" ADD CONSTRAINT "AnalyticsDashboardInsight_dashboardVersionId_fkey" FOREIGN KEY ("dashboardVersionId") REFERENCES "AnalyticsDashboardVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One source file is current for each dataset. Older files remain available for
-- audit/reprocessing without becoming the active analytical source.
CREATE UNIQUE INDEX "AnalyticsDatasetFile_one_current_key"
  ON "AnalyticsDatasetFile"("datasetId")
  WHERE "isCurrent" = true;

-- JSONB containment/filter support for the controlled analytical query engine.
CREATE INDEX "AnalyticsDatasetRow_data_idx"
  ON "AnalyticsDatasetRow" USING GIN ("data");

-- Database-level invariants backstop API and Zod validation.
ALTER TABLE "AnalyticsDataset"
  ADD CONSTRAINT "AnalyticsDataset_name_length_check"
    CHECK (char_length("name") BETWEEN 2 AND 120),
  ADD CONSTRAINT "AnalyticsDataset_description_length_check"
    CHECK ("description" IS NULL OR char_length("description") <= 1000),
  ADD CONSTRAINT "AnalyticsDataset_status_check"
    CHECK ("status" IN ('UPLOADING', 'PROCESSING', 'PROFILING', 'ANALYZING', 'GENERATING', 'READY', 'FAILED')),
  ADD CONSTRAINT "AnalyticsDataset_processing_stage_check"
    CHECK ("processingStage" IN ('UPLOAD', 'PARSING', 'READING_SHEETS', 'PROFILING', 'UNDERSTANDING', 'SEMANTIC_MODEL', 'DASHBOARD_PLANNING', 'DASHBOARD_GENERATION', 'PERSISTING', 'READY', 'FAILED')),
  ADD CONSTRAINT "AnalyticsDataset_counts_check"
    CHECK (
      "rowCount" >= 0 AND "columnCount" >= 0 AND
      "datasetVersion" >= 1 AND "semanticModelVersion" >= 0 AND
      "processingAttempt" >= 0
    ),
  ADD CONSTRAINT "AnalyticsDataset_processing_message_check"
    CHECK ("processingMessage" IS NULL OR char_length("processingMessage") <= 500),
  ADD CONSTRAINT "AnalyticsDataset_failure_fields_check"
    CHECK (
      ("status" = 'FAILED' AND "processingStage" = 'FAILED' AND "failureMessage" IS NOT NULL)
      OR "status" <> 'FAILED'
    );

ALTER TABLE "AnalyticsDatasetFile"
  ADD CONSTRAINT "AnalyticsDatasetFile_version_check"
    CHECK ("version" >= 1 AND "sizeBytes" > 0 AND "sheetCount" >= 0),
  ADD CONSTRAINT "AnalyticsDatasetFile_type_check"
    CHECK ("fileType" IN ('CSV', 'XLSX', 'XLS')),
  ADD CONSTRAINT "AnalyticsDatasetFile_status_check"
    CHECK ("status" IN ('STORED', 'FAILED', 'DELETED')),
  ADD CONSTRAINT "AnalyticsDatasetFile_hash_check"
    CHECK ("sha256" ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT "AnalyticsDatasetFile_name_length_check"
    CHECK (
      char_length("originalFileName") BETWEEN 1 AND 255 AND
      char_length("safeFileName") BETWEEN 1 AND 255 AND
      char_length("storageKey") BETWEEN 1 AND 1000
    ),
  ADD CONSTRAINT "AnalyticsDatasetFile_deleted_shape_check"
    CHECK ("status" <> 'DELETED' OR ("deletedAt" IS NOT NULL AND "isCurrent" = false));

ALTER TABLE "AnalyticsDatasetSheet"
  ADD CONSTRAINT "AnalyticsDatasetSheet_name_length_check"
    CHECK (char_length("name") BETWEEN 1 AND 255),
  ADD CONSTRAINT "AnalyticsDatasetSheet_status_check"
    CHECK ("status" IN ('DISCOVERED', 'SELECTED', 'PROFILED', 'FAILED')),
  ADD CONSTRAINT "AnalyticsDatasetSheet_counts_check"
    CHECK (
      "sheetIndex" >= 0 AND "sourceRowCount" >= 0 AND
      "normalizedRowCount" >= 0 AND "columnCount" >= 0
    ),
  ADD CONSTRAINT "AnalyticsDatasetSheet_header_rows_check"
    CHECK (
      ("detectedHeaderRow" IS NULL OR "detectedHeaderRow" >= 1) AND
      ("dataStartRow" IS NULL OR "dataStartRow" >= 1) AND
      ("detectedHeaderRow" IS NULL OR "dataStartRow" IS NULL OR "dataStartRow" > "detectedHeaderRow")
    ),
  ADD CONSTRAINT "AnalyticsDatasetSheet_recommendation_score_check"
    CHECK ("recommendationScore" IS NULL OR "recommendationScore" BETWEEN 0 AND 1);

ALTER TABLE "AnalyticsDatasetColumn"
  ADD CONSTRAINT "AnalyticsDatasetColumn_ordinal_check"
    CHECK ("ordinal" >= 0),
  ADD CONSTRAINT "AnalyticsDatasetColumn_name_length_check"
    CHECK (
      char_length("originalName") BETWEEN 1 AND 500 AND
      char_length("normalizedName") BETWEEN 1 AND 255 AND
      char_length("displayName") BETWEEN 1 AND 500
    ),
  ADD CONSTRAINT "AnalyticsDatasetColumn_data_type_check"
    CHECK ("dataType" IN ('STRING', 'INTEGER', 'DECIMAL', 'BOOLEAN', 'DATE', 'DATETIME', 'UNKNOWN')),
  ADD CONSTRAINT "AnalyticsDatasetColumn_semantic_type_check"
    CHECK ("semanticType" IN ('IDENTIFIER', 'DIMENSION', 'MEASURE', 'DATE', 'DATETIME', 'BOOLEAN', 'TEXT', 'CATEGORY', 'UNKNOWN')),
  ADD CONSTRAINT "AnalyticsDatasetColumn_profile_counts_check"
    CHECK (
      "uniqueCount" >= 0 AND "nullCount" >= 0 AND
      "nullPercentage" BETWEEN 0 AND 100
    ),
  ADD CONSTRAINT "AnalyticsDatasetColumn_samples_json_check"
    CHECK (jsonb_typeof("sampleValues") = 'array');

ALTER TABLE "AnalyticsDatasetRow"
  ADD CONSTRAINT "AnalyticsDatasetRow_position_check"
    CHECK ("datasetVersion" >= 1 AND "rowNumber" >= 1),
  ADD CONSTRAINT "AnalyticsDatasetRow_data_json_check"
    CHECK (jsonb_typeof("data") = 'object');

ALTER TABLE "AnalyticsDatasetProfile"
  ADD CONSTRAINT "AnalyticsDatasetProfile_counts_check"
    CHECK (
      "datasetVersion" >= 1 AND "rowCount" >= 0 AND
      "columnCount" >= 0 AND "duplicateRowCount" >= 0
    ),
  ADD CONSTRAINT "AnalyticsDatasetProfile_json_check"
    CHECK (
      jsonb_typeof("profile") = 'object' AND
      jsonb_typeof("sampleRows") = 'array' AND
      jsonb_typeof("dataQualityWarnings") = 'array'
    );

ALTER TABLE "AnalyticsProcessingEvent"
  ADD CONSTRAINT "AnalyticsProcessingEvent_sequence_check"
    CHECK ("sequence" >= 1),
  ADD CONSTRAINT "AnalyticsProcessingEvent_stage_check"
    CHECK ("stage" IN ('UPLOAD', 'PARSING', 'READING_SHEETS', 'PROFILING', 'UNDERSTANDING', 'SEMANTIC_MODEL', 'DASHBOARD_PLANNING', 'DASHBOARD_GENERATION', 'PERSISTING', 'READY', 'FAILED')),
  ADD CONSTRAINT "AnalyticsProcessingEvent_status_check"
    CHECK ("status" IN ('STARTED', 'COMPLETED', 'FAILED')),
  ADD CONSTRAINT "AnalyticsProcessingEvent_message_length_check"
    CHECK (char_length("message") BETWEEN 1 AND 500);

ALTER TABLE "AnalyticsSemanticModel"
  ADD CONSTRAINT "AnalyticsSemanticModel_versions_check"
    CHECK ("datasetVersion" >= 1 AND "version" >= 1 AND "schemaVersion" >= 1),
  ADD CONSTRAINT "AnalyticsSemanticModel_source_check"
    CHECK ("source" IN ('AI', 'FALLBACK')),
  ADD CONSTRAINT "AnalyticsSemanticModel_json_check"
    CHECK (
      jsonb_typeof("semanticModel") = 'object' AND
      jsonb_typeof("analysisResult") = 'object'
    );

ALTER TABLE "AnalyticsDashboard"
  ADD CONSTRAINT "AnalyticsDashboard_title_length_check"
    CHECK (char_length("title") BETWEEN 2 AND 160),
  ADD CONSTRAINT "AnalyticsDashboard_description_length_check"
    CHECK ("description" IS NULL OR char_length("description") <= 2000),
  ADD CONSTRAINT "AnalyticsDashboard_status_check"
    CHECK ("status" IN ('READY', 'ARCHIVED'));

ALTER TABLE "AnalyticsDashboardVersion"
  ADD CONSTRAINT "AnalyticsDashboardVersion_versions_check"
    CHECK (
      "datasetVersion" >= 1 AND "version" >= 1 AND
      "schemaVersion" >= 1 AND "visualizationCount" >= 0
    ),
  ADD CONSTRAINT "AnalyticsDashboardVersion_source_check"
    CHECK ("source" IN ('AI', 'FALLBACK', 'USER_EDIT', 'REGENERATED')),
  ADD CONSTRAINT "AnalyticsDashboardVersion_json_check"
    CHECK (
      jsonb_typeof("specification") = 'object' AND
      jsonb_typeof("filterState") IN ('object', 'array') AND
      jsonb_typeof("layoutState") IN ('object', 'array') AND
      jsonb_typeof("visualizationState") IN ('object', 'array') AND
      jsonb_typeof("insightState") IN ('object', 'array')
    );

ALTER TABLE "AnalyticsDashboardVisualization"
  ADD CONSTRAINT "AnalyticsDashboardVisualization_type_check"
    CHECK ("type" IN ('KPI', 'BAR', 'LINE', 'AREA', 'PIE', 'DONUT', 'SCATTER', 'TABLE', 'STACKED_BAR', 'STACKED_AREA')),
  ADD CONSTRAINT "AnalyticsDashboardVisualization_aggregation_check"
    CHECK ("aggregation" IS NULL OR "aggregation" IN ('SUM', 'AVG', 'MIN', 'MAX', 'COUNT')),
  ADD CONSTRAINT "AnalyticsDashboardVisualization_shape_check"
    CHECK (
      char_length("widgetKey") BETWEEN 1 AND 120 AND
      char_length("title") BETWEEN 1 AND 200 AND
      "sortOrder" >= 0 AND
      jsonb_typeof("configuration") = 'object' AND
      jsonb_typeof("layout") = 'object'
    );

ALTER TABLE "AnalyticsDashboardFilter"
  ADD CONSTRAINT "AnalyticsDashboardFilter_type_check"
    CHECK ("type" IN ('SELECT', 'MULTI_SELECT', 'DATE_RANGE', 'NUMERIC_RANGE', 'BOOLEAN', 'SEARCH')),
  ADD CONSTRAINT "AnalyticsDashboardFilter_shape_check"
    CHECK (
      char_length("filterKey") BETWEEN 1 AND 120 AND
      char_length("field") BETWEEN 1 AND 255 AND
      "sortOrder" >= 0 AND
      jsonb_typeof("configuration") = 'object'
    );

ALTER TABLE "AnalyticsDashboardInsight"
  ADD CONSTRAINT "AnalyticsDashboardInsight_source_check"
    CHECK ("source" IN ('AI', 'FALLBACK')),
  ADD CONSTRAINT "AnalyticsDashboardInsight_shape_check"
    CHECK (
      char_length("content") BETWEEN 1 AND 2000 AND
      "sortOrder" >= 0 AND
      ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
    );
