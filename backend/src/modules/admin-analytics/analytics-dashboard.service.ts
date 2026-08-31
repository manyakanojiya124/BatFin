import type { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { analyticsAIService, type AnalyticsAIService } from "./analytics-ai.service.js";
import { createAnalyticsContext } from "./analytics-context.service.js";
import { createDeterministicDashboardSpecification } from "./analytics-dashboard-fallback.service.js";
import {
  preflightDashboardSpecification,
  reconcileDashboardSpecification,
} from "./analytics-dashboard-reconciler.service.js";
import {
  createDashboardSpecificationSchema,
} from "./analytics-dashboard.schemas.js";
import type { AnalyticsSemanticModel } from "./analytics-semantic.schemas.js";

async function nextSequence(transaction: Prisma.TransactionClient, datasetId: string) {
  const value = await transaction.analyticsProcessingEvent.aggregate({ where: { datasetId }, _max: { sequence: true } });
  return (value._max.sequence ?? 0) + 1;
}

async function generationInput(datasetId: string, adminUserId: string) {
  const dataset = await prisma.analyticsDataset.findFirst({ where: { id: datasetId, ownerAdminId: adminUserId, deletedAt: null } });
  if (!dataset?.activeSheetId || dataset.semanticModelVersion < 1) throw new ApiError(409, "Semantic model is required before dashboard generation", "ANALYTICS_SEMANTIC_MODEL_NOT_READY");
  const [sheet, profile, semanticRecord, columns] = await Promise.all([
    prisma.analyticsDatasetSheet.findUnique({ where: { id: dataset.activeSheetId }, select: { id: true, name: true, detectedHeaderRow: true, dataStartRow: true } }),
    prisma.analyticsDatasetProfile.findUnique({ where: { datasetId_datasetVersion_sheetId: { datasetId, datasetVersion: dataset.datasetVersion, sheetId: dataset.activeSheetId } } }),
    prisma.analyticsSemanticModel.findUnique({ where: { datasetId_version: { datasetId, version: dataset.semanticModelVersion } } }),
    prisma.analyticsDatasetColumn.findMany({ where: { datasetId, sheetId: dataset.activeSheetId }, select: { normalizedName: true }, orderBy: { ordinal: "asc" } }),
  ]);
  if (!sheet || !profile || !semanticRecord) throw new ApiError(409, "Dashboard generation inputs are incomplete", "ANALYTICS_DASHBOARD_INPUT_NOT_READY");
  const semanticModel = semanticRecord.semanticModel as unknown as AnalyticsSemanticModel;
  const context = createAnalyticsContext({ dataset: { id: dataset.id, name: dataset.name, description: dataset.description, datasetVersion: dataset.datasetVersion, rowCount: dataset.rowCount, columnCount: dataset.columnCount }, sheet, profile });
  return { dataset, semanticRecord, semanticModel, columns: columns.map((column) => column.normalizedName), context };
}

async function beginPlanning(datasetId: string) {
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({ where: { id: datasetId }, data: { status: "GENERATING", processingStage: "DASHBOARD_PLANNING", processingMessage: "Planning dashboard specification", processingHeartbeatAt: new Date() } });
    await transaction.analyticsProcessingEvent.create({ data: { datasetId, sequence: await nextSequence(transaction, datasetId), stage: "DASHBOARD_PLANNING", status: "STARTED", message: "Dashboard planning started" } });
  });
}

export async function generateAnalyticsDashboard(input: {
  datasetId: string;
  adminUserId: string;
  dashboardId?: string;
  aiService?: AnalyticsAIService;
}) {
  const source = await generationInput(input.datasetId, input.adminUserId);
  await beginPlanning(input.datasetId);
  const schema = createDashboardSpecificationSchema({ semanticModel: source.semanticModel, allFields: source.columns });
  const systemPrompt = [
    "You are a senior business intelligence dashboard architect.",
    "Create a reusable dashboard specification only from the validated semantic model and compact profile.",
    "Choose a concise set of useful KPIs, filters, charts, a detail table, and evidence-backed insights.",
    "Every visualization title must exactly describe its measure, aggregation, dimension, and time grain.",
    "Exclude constant, very sparse, identifier, and incompatible fields from default charts and filters.",
    "Use chronological ordering for dates, Top N for high-cardinality categories, and preserve complete stack groups.",
    "Use only registered semantic dimensions, measures, dates, and fields.",
    "Do not generate React, HTML, SQL, executable code, unsupported calculations, or personal-data visualizations.",
    "Use the 12-column layout and supported visualization registry from the schema.",
  ].join(" ");
  const userPrompt = [
    "Generate a practical interactive dashboard specification.",
    `Semantic model: ${JSON.stringify(source.semanticModel)}`,
    `Compact profile context: ${JSON.stringify(source.context.context)}`,
  ].join("\n\n");
  const aiService = input.aiService ?? analyticsAIService;
  const result = await aiService.generateStructured(
    { operation: "dashboard_specification_generation", schemaName: "batfin_analytics_dashboard_specification", schema, systemPrompt, userPrompt, temperature: 0.1 },
    () => createDeterministicDashboardSpecification(source.semanticModel, source.context.context),
  );
  const reconciled = reconcileDashboardSpecification({
    specification: result.value,
    semantic: source.semanticModel,
    context: source.context.context,
  });
  const preflight = await preflightDashboardSpecification({
    specification: reconciled.specification,
    semantic: source.semanticModel,
    datasetId: source.dataset.id,
    sheetId: source.dataset.activeSheetId!,
    datasetVersion: source.dataset.datasetVersion,
  });
  const validatedSpecification = schema.safeParse(preflight.specification);
  if (!validatedSpecification.success) {
    throw new ApiError(500, "Reconciled dashboard specification failed integrity validation", "ANALYTICS_DASHBOARD_RECONCILIATION_FAILED");
  }
  const specification = validatedSpecification.data;
  const reconciliationWarnings = [...reconciled.warnings, ...preflight.warnings];
  return prisma.$transaction(async (transaction) => {
    let dashboard = input.dashboardId
      ? await transaction.analyticsDashboard.findFirst({ where: { id: input.dashboardId, datasetId: input.datasetId, ownerAdminId: input.adminUserId, deletedAt: null } })
      : await transaction.analyticsDashboard.findFirst({ where: { datasetId: input.datasetId, ownerAdminId: input.adminUserId, deletedAt: null }, orderBy: { createdAt: "asc" } });
    if (input.dashboardId && !dashboard) throw new ApiError(404, "Analytics dashboard not found", "ANALYTICS_DASHBOARD_NOT_FOUND");
    if (!dashboard) {
      dashboard = await transaction.analyticsDashboard.create({ data: { datasetId: input.datasetId, ownerAdminId: input.adminUserId, title: specification.title, description: specification.description, status: "READY" } });
    }
    const latest = await transaction.analyticsDashboardVersion.aggregate({ where: { dashboardId: dashboard.id }, _max: { version: true } });
    const version = (latest._max.version ?? 0) + 1;
    const sourceType = version === 1 ? result.source : "REGENERATED";
    const layoutState = Object.fromEntries(specification.visualizations.map((item) => [item.id, item.layout]));
    const previousState = dashboard.currentVersionId
      ? (await transaction.analyticsDashboardVersion.findUnique({ where: { id: dashboard.currentVersionId }, select: { filterState: true } }))?.filterState
      : [];
    const allowedFilterFields = new Set(specification.filters.map((filter) => filter.field));
    const reconciledFilterState = Array.isArray(previousState)
      ? previousState.filter((item) => Boolean(item) && typeof item === "object" && !Array.isArray(item) && allowedFilterFields.has(String((item as Record<string, unknown>).field ?? "")))
      : [];
    const versionRecord = await transaction.analyticsDashboardVersion.create({
      data: {
        dashboardId: dashboard.id,
        semanticModelId: source.semanticRecord.id,
        datasetVersion: source.dataset.datasetVersion,
        version,
        source: sourceType,
        schemaVersion: specification.schemaVersion,
        specification: specification,
        filterState: reconciledFilterState as Prisma.InputJsonValue,
        layoutState,
        visualizationState: specification.visualizations,
        insightState: specification.insights,
        generationMetadata: {
          operation: "dashboard_specification_generation",
          semanticModelVersion: source.semanticRecord.version,
          contextSchemaVersion: source.context.context.contextSchemaVersion,
          contextSha256: source.context.sha256,
          contextBytes: source.context.sizeBytes,
          provider: result.provider,
          model: result.model,
          attempts: result.attempts,
          repairAttempted: result.repairAttempted,
          responseSha256: result.responseSha256,
          usage: { promptTokens: result.usage.promptTokens, completionTokens: result.usage.completionTokens, totalTokens: result.usage.totalTokens },
          fallbackReason: result.fallbackReason,
          reconciliationWarnings,
          preflightedVisualizationCount: specification.visualizations.length,
        },
        visualizationCount: specification.visualizations.length,
        changeSummary: version === 1 ? "Initial generated dashboard" : "Regenerated dashboard specification",
        aiProvider: result.provider,
        aiProviderModel: result.model,
        createdByAdminId: input.adminUserId,
      },
    });
    await transaction.analyticsDashboardVisualization.createMany({ data: specification.visualizations.map((item, index) => ({ dashboardVersionId: versionRecord.id, widgetKey: item.id, type: item.type, title: item.title, dimensionField: item.dimension, measureField: item.measure, aggregation: item.aggregation, configuration: { description: item.description, secondaryMeasure: item.secondaryMeasure, stackBy: item.stackBy, columns: item.columns, limit: item.limit, timeGrain: item.timeGrain, sort: item.sort, topN: item.topN, showOther: item.showOther, formatOverride: item.formatOverride }, layout: item.layout, visible: item.visible, sortOrder: index })) });
    await transaction.analyticsDashboardFilter.createMany({ data: specification.filters.map((item, index) => ({ dashboardVersionId: versionRecord.id, filterKey: item.id, field: item.field, type: item.type, operator: null, configuration: {}, sortOrder: index })) });
    await transaction.analyticsDashboardInsight.createMany({ data: specification.insights.map((item, index) => ({ dashboardVersionId: versionRecord.id, content: `${item.title}: ${item.content}`, source: result.source, evidence: item.evidence, confidence: item.confidence, sortOrder: index })) });
    await transaction.analyticsDashboard.update({ where: { id: dashboard.id }, data: { title: specification.title, description: specification.description, status: "READY", currentVersionId: versionRecord.id } });
    let sequence = await nextSequence(transaction, input.datasetId);
    const eventData = [
      ["DASHBOARD_PLANNING", "COMPLETED", "Dashboard specification planned"],
      ["DASHBOARD_GENERATION", "STARTED", "Dashboard generation started"],
      ["DASHBOARD_GENERATION", "COMPLETED", `Dashboard version ${version} generated`],
      ["PERSISTING", "STARTED", "Persisting dashboard version"],
      ["PERSISTING", "COMPLETED", "Dashboard version persisted"],
    ] as const;
    for (const [stage, status, message] of eventData) {
      await transaction.analyticsProcessingEvent.create({ data: { datasetId: input.datasetId, sequence, stage, status, message } });
      sequence += 1;
    }
    await transaction.analyticsDataset.update({ where: { id: input.datasetId }, data: { status: "READY", processingStage: "READY", processingMessage: "Dashboard ready", processingHeartbeatAt: new Date() } });
    await transaction.adminAuditLog.create({ data: { adminUserId: input.adminUserId, action: "ANALYTICS_DASHBOARD_GENERATED", resourceType: "AnalyticsDashboard", resourceId: dashboard.id, metadata: { datasetId: input.datasetId, datasetVersion: source.dataset.datasetVersion, semanticModelVersion: source.semanticRecord.version, dashboardVersion: version, source: result.source, provider: result.provider, model: result.model, fallbackReason: result.fallbackReason, visualizationCount: specification.visualizations.length, filterCount: specification.filters.length, insightCount: specification.insights.length } } });
    return { dashboardId: dashboard.id, dashboardVersionId: versionRecord.id, version, specification: specification, result };
  }, { timeout: 120_000, maxWait: 10_000 });
}
