-- Preserve provider/fallback attempts, context and response fingerprints, usage,
-- and generation reason for each immutable dashboard version.
ALTER TABLE "AnalyticsDashboardVersion"
  ADD COLUMN "generationMetadata" JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE "AnalyticsDashboardVersion"
  ALTER COLUMN "generationMetadata" DROP DEFAULT;

ALTER TABLE "AnalyticsDashboardVersion"
  ADD CONSTRAINT "AnalyticsDashboardVersion_generation_metadata_check"
    CHECK (jsonb_typeof("generationMetadata") = 'object');
