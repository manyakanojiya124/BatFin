import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { prisma } from "../src/database/prisma.js";
import { executeAnalyticsQuery } from "../src/modules/admin-analytics/analytics-query.service.js";

const ROWS = 100_000;
const admin = await prisma.adminUser.findFirstOrThrow({ where: { role: "SUPER_ADMIN" } });
const datasetId = randomUUID();
const fileId = randomUUID();
const sheetId = randomUUID();
const dashboardId = randomUUID();
try {
  await prisma.analyticsDataset.create({ data: { id: datasetId, ownerAdminId: admin.id, name: "Temporary analytics performance fixture", status: "READY", processingStage: "READY", rowCount: ROWS, columnCount: 5, semanticModelVersion: 1 } });
  await prisma.analyticsDatasetFile.create({ data: { id: fileId, datasetId, version: 1, originalFileName: "benchmark.csv", safeFileName: "benchmark.csv", fileType: "CSV", mimeType: "text/csv", sizeBytes: 1n, sha256: "0".repeat(64), storageProvider: "LOCAL", storageKey: `benchmarks/${datasetId}`, status: "STORED" } });
  await prisma.analyticsDatasetSheet.create({ data: { id: sheetId, datasetId, fileId, name: "Benchmark", sheetIndex: 0, status: "PROFILED", sourceRowCount: ROWS + 1, normalizedRowCount: ROWS, columnCount: 5, detectedHeaderRow: 1, dataStartRow: 2, recommendedAsPrimary: true, sampleRows: [] } });
  await prisma.analyticsDataset.update({ where: { id: datasetId }, data: { activeSheetId: sheetId } });
  await prisma.analyticsDatasetColumn.createMany({ data: [
    { datasetId, sheetId, ordinal: 0, originalName: "Record ID", normalizedName: "record_id", displayName: "Record ID", dataType: "INTEGER", semanticType: "IDENTIFIER", nullable: false, uniqueCount: ROWS, sampleValues: [1,2,3] },
    { datasetId, sheetId, ordinal: 1, originalName: "Size Band", normalizedName: "size_band", displayName: "Size Band", dataType: "STRING", semanticType: "CATEGORY", nullable: false, uniqueCount: 3, sampleValues: ["A","B","C"] },
    { datasetId, sheetId, ordinal: 2, originalName: "Region", normalizedName: "region", displayName: "Region", dataType: "STRING", semanticType: "CATEGORY", nullable: false, uniqueCount: 20, sampleValues: ["Region 1","Region 2"] },
    { datasetId, sheetId, ordinal: 3, originalName: "Event Date", normalizedName: "event_date", displayName: "Event Date", dataType: "DATE", semanticType: "DATE", nullable: false, uniqueCount: 365, sampleValues: ["2026-01-01"] },
    { datasetId, sheetId, ordinal: 4, originalName: "Amount", normalizedName: "amount", displayName: "Amount", dataType: "DECIMAL", semanticType: "MEASURE", nullable: false, uniqueCount: 1000, sampleValues: [100,200] },
  ] });
  for (let offset = 0; offset < ROWS; offset += 2_000) {
    const rows = Array.from({ length: Math.min(2_000, ROWS - offset) }, (_, index) => {
      const value = offset + index + 1;
      return { datasetId, sheetId, datasetVersion: 1, rowNumber: value + 1, data: { record_id: value, size_band: value <= 1_000 ? "A" : value <= 10_000 ? "B" : "C", region: `Region ${(value % 20) + 1}`, event_date: `2026-${String((value % 12) + 1).padStart(2,"0")}-${String((value % 27) + 1).padStart(2,"0")}`, amount: (value % 1000) + 0.5 } };
    });
    await prisma.analyticsDatasetRow.createMany({ data: rows });
  }
  const semantic = await prisma.analyticsSemanticModel.create({ data: { datasetId, datasetVersion: 1, version: 1, source: "FALLBACK", schemaVersion: 1, semanticModel: {
    schemaVersion: 1, title: "Benchmark Semantic Model", datasetSummary: "Synthetic non-sensitive performance fixture with one hundred thousand rows.", businessDomain: "General business operations", domainKey: "generic", defaultCurrencyCode: null,
    identifiers: [{ field: "record_id", label: "Record ID", description: "Synthetic identifier.", confidence: 1 }],
    dimensions: [{ field: "size_band", label: "Size Band", kind: "CATEGORY", role: "SEGMENT", description: "Benchmark size band.", confidence: 1 }, { field: "region", label: "Region", kind: "CATEGORY", role: "GEOGRAPHY", description: "Synthetic region.", confidence: 1 }],
    measures: [{ id: "row_count", field: null, label: "Record Count", kind: "ROW_COUNT", aggregation: "COUNT", format: "NUMBER", currencyCode: null, unit: "records", role: "COUNT", additive: true, description: "Record count.", confidence: 1 }, { id: "amount", field: "amount", label: "Amount", kind: "FIELD", aggregation: "SUM", format: "NUMBER", currencyCode: null, unit: null, role: "VALUE", additive: true, description: "Synthetic amount.", confidence: 1 }],
    dateFields: [{ field: "event_date", label: "Event Date", type: "DATE", defaultGrain: "MONTH", description: "Synthetic date.", confidence: 1 }], suggestedFilters: [], calculatedMetrics: [],
  }, analysisResult: {}, generatedByAdminId: admin.id } });
  await prisma.analyticsDashboard.create({ data: { id: dashboardId, datasetId, ownerAdminId: admin.id, title: "Benchmark dashboard", status: "READY" } });
  const version = await prisma.analyticsDashboardVersion.create({ data: { dashboardId, semanticModelId: semantic.id, datasetVersion: 1, version: 1, source: "FALLBACK", schemaVersion: 1, specification: {}, filterState: [], layoutState: {}, visualizationState: [], insightState: [], generationMetadata: {}, visualizationCount: 0, createdByAdminId: admin.id } });
  await prisma.analyticsDashboard.update({ where: { id: dashboardId }, data: { currentVersionId: version.id } });
  const cases = [
    { label: "1K", filters: [{ field: "size_band", type: "SELECT", value: "A" }] },
    { label: "10K", filters: [{ field: "size_band", type: "MULTI_SELECT", values: ["A","B"] }] },
    { label: "100K", filters: [] },
  ];
  for (const item of cases) {
    const started = performance.now();
    const result = await executeAnalyticsQuery(dashboardId, admin.id, { mode: "AGGREGATE", dimension: "region", measure: "amount", filters: item.filters, topN: 20, limit: 50, showOther: false });
    const duration = performance.now() - started;
    console.log(`${item.label} grouped query: ${duration.toFixed(1)} ms, ${result.mode === "AGGREGATE" ? result.rows.length : 0} groups`);
  }
  const timeStarted = performance.now();
  await executeAnalyticsQuery(dashboardId, admin.id, { mode: "AGGREGATE", dimension: "event_date", measure: "amount", filters: [], timeGrain: "MONTH", sort: "TIME_ASC", limit: 100 });
  console.log(`100K monthly time series: ${(performance.now() - timeStarted).toFixed(1)} ms`);
} finally {
  const dashboard = await prisma.analyticsDashboard.findUnique({ where: { id: dashboardId } });
  if (dashboard) {
    await prisma.analyticsDashboard.update({ where: { id: dashboardId }, data: { currentVersionId: null } });
    await prisma.analyticsDashboard.delete({ where: { id: dashboardId } });
  }
  const dataset = await prisma.analyticsDataset.findUnique({ where: { id: datasetId } });
  if (dataset) {
    await prisma.analyticsDataset.update({ where: { id: datasetId }, data: { activeSheetId: null } });
    await prisma.analyticsDataset.delete({ where: { id: datasetId } });
  }
  await prisma.$disconnect();
}
