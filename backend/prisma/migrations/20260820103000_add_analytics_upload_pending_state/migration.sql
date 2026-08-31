-- Phase 3 upload lifecycle: persist file metadata before filesystem writes so
-- interrupted uploads can be recovered without orphaning an untracked source.
ALTER TABLE "AnalyticsDatasetFile"
  DROP CONSTRAINT "AnalyticsDatasetFile_status_check";

ALTER TABLE "AnalyticsDatasetFile"
  ADD CONSTRAINT "AnalyticsDatasetFile_status_check"
    CHECK ("status" IN ('PENDING', 'STORED', 'FAILED', 'DELETED'));
