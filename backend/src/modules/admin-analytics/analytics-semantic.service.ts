import type { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { analyticsAIService, type AnalyticsAIService } from "./analytics-ai.service.js";
import { createAnalyticsContext } from "./analytics-context.service.js";
import {
  createDeterministicSemanticModel,
  reconcileSemanticModel,
} from "./analytics-semantic-fallback.service.js";
import {
  createSemanticModelSchema,
  type AnalyticsSemanticModel,
} from "./analytics-semantic.schemas.js";

async function nextSequence(
  transaction: Prisma.TransactionClient,
  datasetId: string,
) {
  const result = await transaction.analyticsProcessingEvent.aggregate({
    where: { datasetId },
    _max: { sequence: true },
  });
  return (result._max.sequence ?? 0) + 1;
}

function semanticColumnTypes(model: AnalyticsSemanticModel) {
  const types = new Map<string, string>();
  for (const item of model.identifiers) types.set(item.field, "IDENTIFIER");
  for (const item of model.dimensions) {
    types.set(
      item.field,
      item.kind === "CATEGORY"
        ? "CATEGORY"
        : item.kind === "BOOLEAN"
          ? "BOOLEAN"
          : "DIMENSION",
    );
  }
  for (const item of model.dateFields) types.set(item.field, item.type);
  for (const item of model.measures) {
    if (item.kind === "FIELD" && item.field) {
      types.set(item.field, "MEASURE");
    }
  }
  return types;
}

async function contextForDataset(datasetId: string) {
  const dataset = await prisma.analyticsDataset.findFirst({
    where: { id: datasetId, deletedAt: null },
  });
  if (!dataset?.activeSheetId) {
    throw new ApiError(
      409,
      "Profiled dataset with an active worksheet is required",
      "ANALYTICS_PROFILE_NOT_READY",
    );
  }
  const [sheet, profile, columns] = await Promise.all([
    prisma.analyticsDatasetSheet.findUnique({
      where: { id: dataset.activeSheetId },
      select: {
        id: true,
        name: true,
        detectedHeaderRow: true,
        dataStartRow: true,
      },
    }),
    prisma.analyticsDatasetProfile.findUnique({
      where: {
        datasetId_datasetVersion_sheetId: {
          datasetId,
          datasetVersion: dataset.datasetVersion,
          sheetId: dataset.activeSheetId,
        },
      },
    }),
    prisma.analyticsDatasetColumn.findMany({
      where: { datasetId, sheetId: dataset.activeSheetId },
      select: { normalizedName: true, dataType: true },
      orderBy: { ordinal: "asc" },
    }),
  ]);
  if (!sheet || !profile || !columns.length) {
    throw new ApiError(
      409,
      "Dataset profile is not ready for semantic analysis",
      "ANALYTICS_PROFILE_NOT_READY",
    );
  }
  const context = createAnalyticsContext({
    dataset: {
      id: dataset.id,
      name: dataset.name,
      description: dataset.description,
      datasetVersion: dataset.datasetVersion,
      rowCount: dataset.rowCount,
      columnCount: dataset.columnCount,
    },
    sheet,
    profile,
  });
  return { dataset, sheet, profile, columns, context };
}

export async function generateAnalyticsSemanticModel(
  datasetId: string,
  generatedByAdminId: string,
  aiService: AnalyticsAIService = analyticsAIService,
) {
  const source = await contextForDataset(datasetId);
  if (source.dataset.ownerAdminId !== generatedByAdminId) {
    throw new ApiError(
      404,
      "Analytics dataset not found",
      "ANALYTICS_DATASET_NOT_FOUND",
    );
  }
  const schema = createSemanticModelSchema(
    source.columns.map((column) => ({
      field: column.normalizedName,
      dataType: column.dataType,
    })),
  );
  const systemPrompt = [
    "You are a senior business intelligence analyst.",
    "Determine what the profiled dataset represents and produce a semantic model only.",
    "Classify important identifiers, dimensions, numeric measures, dates, and useful global filters.",
    "Choose SUM for additive financial amounts and AVG for rates, binary indicators, ratios, percentages, IRR, and LTV.",
    "Infer ISO currency codes and units only when supported by headers or profile evidence.",
    "Exclude constant and very sparse fields from default dimensions, measures, and filters.",
    "Use only fields present in the supplied context.",
    "Do not create dashboards, chart specifications, SQL, code, unsupported claims, or personal-data insights.",
    "Sensitive sample fields are intentionally redacted and must remain identifiers, not measures or chart dimensions.",
  ].join(" ");
  const userPrompt = [
    "Create a reusable semantic model from this compact persisted profile.",
    "Prioritize business-relevant fields rather than including every column.",
    "Calculated metrics must use only the structured operations in the schema and valid numeric fields.",
    JSON.stringify(source.context.context),
  ].join("\n\n");
  const result = await aiService.generateStructured(
    {
      operation: "semantic_model_generation",
      schemaName: "batfin_analytics_semantic_model",
      schema,
      systemPrompt,
      userPrompt,
      temperature: 0.1,
    },
    () => createDeterministicSemanticModel(source.context.context),
  );
  const reconciledSemantic = reconcileSemanticModel(result.value, source.context.context);
  const validatedSemantic = schema.safeParse(reconciledSemantic);
  if (!validatedSemantic.success) {
    throw new ApiError(500, "Reconciled semantic model failed integrity validation", "ANALYTICS_SEMANTIC_RECONCILIATION_FAILED");
  }
  const semantic = validatedSemantic.data;
  const semanticTypes = semanticColumnTypes(semantic);

  return prisma.$transaction(
    async (transaction) => {
      const latest = await transaction.analyticsSemanticModel.aggregate({
        where: { datasetId },
        _max: { version: true },
      });
      const version = (latest._max.version ?? 0) + 1;
      await transaction.analyticsDatasetColumn.updateMany({
        where: {
          datasetId,
          sheetId: source.sheet.id,
        },
        data: { semanticType: "UNKNOWN" },
      });
      for (const [field, semanticType] of semanticTypes) {
        await transaction.analyticsDatasetColumn.updateMany({
          where: {
            datasetId,
            sheetId: source.sheet.id,
            normalizedName: field,
          },
          data: { semanticType },
        });
      }
      const semanticModel = await transaction.analyticsSemanticModel.create({
        data: {
          datasetId,
          datasetVersion: source.dataset.datasetVersion,
          version,
          source: result.source,
          provider: result.provider,
          providerModel: result.model,
          schemaVersion: semantic.schemaVersion,
          semanticModel: semantic,
          analysisResult: {
            operation: "semantic_model_generation",
            contextSchemaVersion: source.context.context.contextSchemaVersion,
            contextSha256: source.context.sha256,
            contextBytes: source.context.sizeBytes,
            provider: result.provider,
            model: result.model,
            attempts: result.attempts,
            repairAttempted: result.repairAttempted,
            responseSha256: result.responseSha256,
            usage: {
              promptTokens: result.usage.promptTokens,
              completionTokens: result.usage.completionTokens,
              totalTokens: result.usage.totalTokens,
            },
            fallbackReason: result.fallbackReason,
          },
          validationWarnings: result.fallbackReason
            ? [
                {
                  code: result.fallbackReason,
                  message:
                    "Deterministic semantic fallback was used instead of the configured AI provider.",
                },
              ]
            : [],
          generatedByAdminId,
        },
      });
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          semanticModelVersion: version,
          lastAnalyzedAt: new Date(),
          status: "GENERATING",
          processingStage: "DASHBOARD_PLANNING",
          processingMessage:
            "Semantic model ready; awaiting dashboard specification",
          processingHeartbeatAt: new Date(),
        },
      });
      let sequence = await nextSequence(transaction, datasetId);
      await transaction.analyticsProcessingEvent.create({
        data: {
          datasetId,
          sequence,
          stage: "UNDERSTANDING",
          status: "COMPLETED",
          message: "Dataset business context understood",
          details: {
            source: result.source,
            provider: result.provider,
            model: result.model,
            fallbackReason: result.fallbackReason,
          },
        },
      });
      sequence += 1;
      await transaction.analyticsProcessingEvent.create({
        data: {
          datasetId,
          sequence,
          stage: "SEMANTIC_MODEL",
          status: "STARTED",
          message: "Persisting validated semantic model",
        },
      });
      sequence += 1;
      await transaction.analyticsProcessingEvent.create({
        data: {
          datasetId,
          sequence,
          stage: "SEMANTIC_MODEL",
          status: "COMPLETED",
          message: `Semantic model version ${version} persisted`,
          details: {
            semanticModelId: semanticModel.id,
            semanticModelVersion: version,
            source: result.source,
            identifierCount: semantic.identifiers.length,
            dimensionCount: semantic.dimensions.length,
            measureCount: semantic.measures.length,
            dateFieldCount: semantic.dateFields.length,
            filterCount: semantic.suggestedFilters.length,
          },
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId: generatedByAdminId,
          action: "ANALYTICS_SEMANTIC_MODEL_GENERATED",
          resourceType: "AnalyticsSemanticModel",
          resourceId: semanticModel.id,
          metadata: {
            datasetId,
            datasetVersion: source.dataset.datasetVersion,
            semanticModelVersion: version,
            source: result.source,
            provider: result.provider,
            model: result.model,
            fallbackReason: result.fallbackReason,
            contextSha256: source.context.sha256,
          },
        },
      });
      return {
        semanticModel: {
          ...semanticModel,
          semanticModel: semantic,
        },
        result,
      };
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}
