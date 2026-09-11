import type { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import {
  detectHeaderRow,
  scorePrimarySheet,
  type AnalyticsCell,
} from "./analytics-header-detection.service.js";
import { normalizeAnalyticsSheet } from "./analytics-normalization.service.js";
import { generateAnalyticsDashboard } from "./analytics-dashboard.service.js";
import { profileAnalyticsDataset } from "./analytics-profile.service.js";
import { generateAnalyticsSemanticModel } from "./analytics-semantic.service.js";
import { analyticsFileStorage } from "./analytics-storage.service.js";
import {
  readAnalyticsWorkbook,
  type ParsedAnalyticsSheet,
  type ParsedAnalyticsWorkbook,
} from "./analytics-workbook.service.js";

function jsonCell(value: AnalyticsCell | undefined) {
  if (value instanceof Date) return value.toISOString();
  if (
    value === null ||
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value ?? null;
  }
  return String(value);
}

function rawSample(sheet: ParsedAnalyticsSheet, startIndex: number) {
  return sheet.matrix
    .slice(startIndex, startIndex + 5)
    .map((row) => row.slice(0, 50).map(jsonCell));
}

async function nextSequence(
  transaction: Prisma.TransactionClient,
  datasetId: string,
) {
  const aggregate = await transaction.analyticsProcessingEvent.aggregate({
    where: { datasetId },
    _max: { sequence: true },
  });
  return (aggregate._max.sequence ?? 0) + 1;
}

async function addEvent(
  transaction: Prisma.TransactionClient,
  input: {
    datasetId: string;
    stage: string;
    status: string;
    message: string;
    details?: Prisma.InputJsonValue;
  },
) {
  return transaction.analyticsProcessingEvent.create({
    data: {
      datasetId: input.datasetId,
      sequence: await nextSequence(transaction, input.datasetId),
      stage: input.stage,
      status: input.status,
      message: input.message,
      ...(input.details !== undefined ? { details: input.details } : {}),
    },
  });
}

async function currentSource(datasetId: string) {
  const dataset = await prisma.analyticsDataset.findFirst({
    where: { id: datasetId, deletedAt: null },
    include: {
      files: {
        where: { isCurrent: true, status: "STORED", deletedAt: null },
        orderBy: { version: "desc" },
        take: 1,
      },
    },
  });
  if (!dataset) {
    throw new ApiError(
      404,
      "Analytics dataset not found",
      "ANALYTICS_DATASET_NOT_FOUND",
    );
  }
  const file = dataset.files[0];
  if (!file) {
    throw new ApiError(
      409,
      "Analytics dataset has no stored current source file",
      "ANALYTICS_SOURCE_NOT_FOUND",
    );
  }
  return { dataset, file };
}

async function failDataset(
  datasetId: string,
  ownerAdminId: string,
  error: unknown,
  attemptedStage: string,
) {
  const code=error instanceof ApiError?error.code:"ANALYTICS_PROCESSING_FAILED";
  const message=error instanceof ApiError?error.message:"Analytics processing could not be completed";
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.updateMany({
      where: { id: datasetId, deletedAt: null },
      data: {
        status: "FAILED",
        processingStage: "FAILED",
        processingMessage: message.slice(0, 500),
        failureCode: code.slice(0, 100),
        failureMessage: message.slice(0, 1000),
        processingHeartbeatAt: new Date(),
      },
    });
    await addEvent(transaction, {
      datasetId,
      stage: attemptedStage,
      status: "FAILED",
      message: message.slice(0, 500),
      details: { code },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: ownerAdminId,
        action: "ANALYTICS_DATASET_PARSE_FAILED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          attemptedStage,
          errorCode: code,
        },
        success: false,
      },
    });
  });
}

async function beginStage(
  datasetId: string,
  stage: string,
  message: string,
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data: {
        status: "PROCESSING",
        processingStage: stage,
        processingMessage: message,
        processingHeartbeatAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });
    await addEvent(transaction, {
      datasetId,
      stage,
      status: "STARTED",
      message,
    });
  });
}

async function completeStage(
  datasetId: string,
  stage: string,
  message: string,
  details?: Prisma.InputJsonValue,
) {
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data: {
        processingMessage: message,
        processingHeartbeatAt: new Date(),
      },
    });
    await addEvent(transaction, {
      datasetId,
      stage,
      status: "COMPLETED",
      message,
      ...(details !== undefined ? { details } : {}),
    });
  });
}

interface SheetDiscovery {
  parsed: ParsedAnalyticsSheet;
  header: ReturnType<typeof detectHeaderRow>;
  score: number;
  reason: string;
}

function discoverSheets(workbook: ParsedAnalyticsWorkbook) {
  return workbook.sheets.map<SheetDiscovery>((sheet) => {
    const header = detectHeaderRow(sheet.matrix);
    const recommendation = scorePrimarySheet({
      name: sheet.name,
      hidden: sheet.hidden,
      sourceRowCount: sheet.sourceRowCount,
      formulaCount: sheet.formulaCount,
      header,
    });
    return {
      parsed: sheet,
      header,
      score: recommendation.score,
      reason: recommendation.reason,
    };
  });
}

async function persistSelectedSheet(
  datasetId: string,
  sheetId: string,
  workbook?: ParsedAnalyticsWorkbook,
) {
  const source = await currentSource(datasetId);
  const selected = await prisma.analyticsDatasetSheet.findFirst({
    where: {
      id: sheetId,
      datasetId,
      fileId: source.file.id,
    },
  });
  if (!selected) {
    throw new ApiError(
      404,
      "Analytics worksheet not found",
      "ANALYTICS_SHEET_NOT_FOUND",
    );
  }
  const parsedWorkbook =
    workbook ??
    readAnalyticsWorkbook(
      await analyticsFileStorage.read(source.file.storageKey),
      source.file.fileType,
    );
  const parsedSheet = parsedWorkbook.sheets.find(
    (sheet) => sheet.sheetIndex === selected.sheetIndex,
  );
  if (!parsedSheet) {
    throw new ApiError(
      409,
      "Selected worksheet is no longer available in the source file",
      "ANALYTICS_SHEET_SOURCE_MISMATCH",
    );
  }
  const header = detectHeaderRow(parsedSheet.matrix);
  if (!header) {
    throw new ApiError(
      422,
      "A reliable tabular header could not be detected in this worksheet",
      "ANALYTICS_HEADER_NOT_FOUND",
    );
  }

  await beginStage(
    datasetId,
    "PERSISTING",
    `Normalizing worksheet ${selected.name}`,
  );
  const normalized = normalizeAnalyticsSheet(parsedSheet.matrix, header);
  await prisma.$transaction(
    async (transaction) => {
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: { activeSheetId: null },
      });
      await transaction.analyticsDatasetProfile.deleteMany({
        where: {
          datasetId,
          sheetId,
          datasetVersion: source.dataset.datasetVersion,
        },
      });
      await transaction.analyticsDatasetRow.deleteMany({
        where: {
          datasetId,
          sheetId,
          datasetVersion: source.dataset.datasetVersion,
        },
      });
      await transaction.analyticsDatasetColumn.deleteMany({
        where: { datasetId, sheetId },
      });
      await transaction.analyticsDatasetColumn.createMany({
        data: normalized.columns.map((column) => ({
          datasetId,
          sheetId,
          ordinal: column.ordinal,
          originalName: column.originalName,
          normalizedName: column.normalizedName,
          displayName: column.displayName,
          dataType: column.dataType,
          semanticType: "UNKNOWN",
          nullable: column.nullable,
          sampleValues: column.sampleValues,
        })),
      });
      for (let offset = 0; offset < normalized.rows.length; offset += 500) {
        const batch = normalized.rows.slice(offset, offset + 500);
        await transaction.analyticsDatasetRow.createMany({
          data: batch.map((row) => ({
            datasetId,
            sheetId,
            datasetVersion: source.dataset.datasetVersion,
            rowNumber: row.rowNumber,
            data: row.data,
          })),
        });
      }
      await transaction.analyticsDatasetSheet.updateMany({
        where: {
          datasetId,
          status: "SELECTED",
          id: { not: sheetId },
        },
        data: { status: "DISCOVERED" },
      });
      await transaction.analyticsDatasetSheet.update({
        where: { id: sheetId },
        data: {
          status: "SELECTED",
          detectedHeaderRow: header.headerRowIndex + 1,
          dataStartRow: header.dataStartRowIndex + 1,
          normalizedRowCount: normalized.rowCount,
          columnCount: normalized.columnCount,
          sampleRows: normalized.sampleRows,
        },
      });
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          activeSheetId: sheetId,
          status: "PROFILING",
          processingStage: "PROFILING",
          processingMessage: "Normalized data stored; awaiting profiler",
          rowCount: normalized.rowCount,
          columnCount: normalized.columnCount,
          processingHeartbeatAt: new Date(),
          failureCode: null,
          failureMessage: null,
        },
      });
      await addEvent(transaction, {
        datasetId,
        stage: "PERSISTING",
        status: "COMPLETED",
        message: `Stored ${normalized.rowCount.toLocaleString("en-IN")} normalized rows and ${normalized.columnCount} columns${normalized.excludedSummaryRowCount ? `; excluded ${normalized.excludedSummaryRowCount} detected summary row(s)` : ""}`,
        details: {
          sheetId,
          headerRow: header.headerRowIndex + 1,
          dataStartRow: header.dataStartRowIndex + 1,
          rowCount: normalized.rowCount,
          columnCount: normalized.columnCount,
          excludedSummaryRowCount: normalized.excludedSummaryRowCount,
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId: source.dataset.ownerAdminId,
          action: "ANALYTICS_SHEET_NORMALIZED",
          resourceType: "AnalyticsDatasetSheet",
          resourceId: sheetId,
          metadata: {
            datasetId,
            datasetVersion: source.dataset.datasetVersion,
            sheetIndex: selected.sheetIndex,
            headerRow: header.headerRowIndex + 1,
            rowCount: normalized.rowCount,
            columnCount: normalized.columnCount,
            excludedSummaryRowCount: normalized.excludedSummaryRowCount,
          },
        },
      });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );
}

async function discoverDataset(datasetId: string) {
  const source = await currentSource(datasetId);
  let attemptedStage = "PARSING";
  try {
    await beginStage(datasetId, "PARSING", "Reading source file");
    const buffer = await analyticsFileStorage.read(source.file.storageKey);
    const workbook = readAnalyticsWorkbook(buffer, source.file.fileType);
    await completeStage(
      datasetId,
      "PARSING",
      "Source file parsed",
      {
        fileType: source.file.fileType,
        worksheetCount: workbook.sheets.length,
      },
    );
    attemptedStage = "READING_SHEETS";
    await beginStage(
      datasetId,
      "READING_SHEETS",
      "Detecting worksheet tables and headers",
    );
    const discovery = discoverSheets(workbook);
    const recommended = [...discovery]
      .filter((item) => item.header)
      .sort((left, right) => right.score - left.score)[0];

    const createdSheets = await prisma.$transaction(async (transaction) => {
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: { activeSheetId: null },
      });
      await transaction.analyticsDatasetSheet.deleteMany({
        where: { datasetId, fileId: source.file.id },
      });
      const created: Array<{ id: string; sheetIndex: number }> = [];
      for (const item of discovery) {
        const sheet = await transaction.analyticsDatasetSheet.create({
          data: {
            datasetId,
            fileId: source.file.id,
            name: item.parsed.name,
            sheetIndex: item.parsed.sheetIndex,
            status: "DISCOVERED",
            sourceRowCount: item.parsed.sourceRowCount,
            normalizedRowCount: 0,
            columnCount:
              item.header?.columnCount ?? item.parsed.sourceColumnCount,
            detectedHeaderRow:
              item.header === null ? null : item.header.headerRowIndex + 1,
            dataStartRow:
              item.header === null ? null : item.header.dataStartRowIndex + 1,
            recommendedAsPrimary: item === recommended,
            recommendationScore: item.score,
            recommendationReason: item.reason,
            metadata: {
              hidden: item.parsed.hidden,
              declaredRowCount: item.parsed.declaredRowCount,
              declaredColumnCount: item.parsed.declaredColumnCount,
              mergedCellCount: item.parsed.mergedCellCount,
              formulaCount: item.parsed.formulaCount,
              headerConfidence: item.header?.confidence ?? 0,
              headerReason: item.header?.reason ?? null,
            },
            sampleRows: rawSample(
              item.parsed,
              item.header?.dataStartRowIndex ?? 0,
            ),
          },
          select: { id: true, sheetIndex: true },
        });
        created.push(sheet);
      }
      await transaction.analyticsDatasetFile.update({
        where: { id: source.file.id },
        data: { sheetCount: created.length },
      });
      await addEvent(transaction, {
        datasetId,
        stage: "READING_SHEETS",
        status: "COMPLETED",
        message: `Discovered ${created.length} worksheet${created.length === 1 ? "" : "s"}`,
        details: {
          worksheetCount: created.length,
          recommendedSheetIndex: recommended?.parsed.sheetIndex ?? null,
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId: source.dataset.ownerAdminId,
          action: "ANALYTICS_WORKBOOK_DISCOVERED",
          resourceType: "AnalyticsDataset",
          resourceId: datasetId,
          metadata: {
            fileType: source.file.fileType,
            worksheetCount: created.length,
            recommendedSheetIndex: recommended?.parsed.sheetIndex ?? null,
          },
        },
      });
      return created;
    });

    if (createdSheets.length === 1) {
      attemptedStage = "PERSISTING";
      await persistSelectedSheet(
        datasetId,
        createdSheets[0]!.id,
        workbook,
      );
      attemptedStage = "PROFILING";
      await profileAnalyticsDataset(datasetId, createdSheets[0]!.id);
    } else {
      await prisma.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          status: "PROCESSING",
          processingStage: "READING_SHEETS",
          processingMessage: `${createdSheets.length} worksheets discovered; select a worksheet to continue`,
          processingHeartbeatAt: new Date(),
        },
      });
    }
  } catch (error) {
    await failDataset(
      datasetId,
      source.dataset.ownerAdminId,
      error,
      attemptedStage,
    );
  }
}

async function processSelectedSheet(datasetId: string, sheetId: string) {
  const source = await currentSource(datasetId);
  let attemptedStage = "PERSISTING";
  try {
    await persistSelectedSheet(datasetId, sheetId);
    attemptedStage = "PROFILING";
    await profileAnalyticsDataset(datasetId, sheetId);
  } catch (error) {
    await failDataset(
      datasetId,
      source.dataset.ownerAdminId,
      error,
      attemptedStage,
    );
  }
}

async function processProfile(datasetId: string, sheetId: string) {
  const source = await currentSource(datasetId);
  try {
    await profileAnalyticsDataset(datasetId, sheetId);
  } catch (error) {
    await failDataset(
      datasetId,
      source.dataset.ownerAdminId,
      error,
      "PROFILING",
    );
  }
}

async function processSemanticModel(datasetId: string) {
  const source = await currentSource(datasetId);
  try {
    await generateAnalyticsSemanticModel(
      datasetId,
      source.dataset.ownerAdminId,
    );
    await generateAnalyticsDashboard({
      datasetId,
      adminUserId: source.dataset.ownerAdminId,
    });
  } catch (error) {
    await failDataset(
      datasetId,
      source.dataset.ownerAdminId,
      error,
      "SEMANTIC_MODEL",
    );
  }
}

async function processDashboard(datasetId: string, dashboardId?: string) {
  const source = await currentSource(datasetId);
  try {
    await generateAnalyticsDashboard({
      datasetId,
      adminUserId: source.dataset.ownerAdminId,
      dashboardId,
    });
  } catch (error) {
    await failDataset(
      datasetId,
      source.dataset.ownerAdminId,
      error,
      "DASHBOARD_GENERATION",
    );
  }
}

class AnalyticsProcessingWorker {
  private readonly running = new Map<string, Promise<void>>();

  private schedule(datasetId: string, operation: () => Promise<void>) {
    if (this.running.has(datasetId)) return false;
    const task = Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        console.error(
          `Analytics processing task ${datasetId} failed:`,
          error instanceof Error ? error.message : "Unknown error",
        );
      })
      .finally(() => this.running.delete(datasetId));
    this.running.set(datasetId, task);
    return true;
  }

  enqueueDiscovery(datasetId: string) {
    return this.schedule(datasetId, () => discoverDataset(datasetId));
  }

  enqueueSheet(datasetId: string, sheetId: string) {
    return this.schedule(datasetId, () =>
      processSelectedSheet(datasetId, sheetId),
    );
  }

  enqueueProfile(datasetId: string, sheetId: string) {
    return this.schedule(datasetId, () => processProfile(datasetId, sheetId));
  }

  enqueueSemanticModel(datasetId: string) {
    return this.schedule(datasetId, () => processSemanticModel(datasetId));
  }

  enqueueDashboard(datasetId: string, dashboardId?: string) {
    return this.schedule(datasetId, () => processDashboard(datasetId, dashboardId));
  }

  isRunning(datasetId: string) {
    return this.running.has(datasetId);
  }

  async discoverNow(datasetId: string) {
    await discoverDataset(datasetId);
  }

  async processSheetNow(datasetId: string, sheetId: string) {
    await processSelectedSheet(datasetId, sheetId);
  }

  async profileNow(datasetId: string, sheetId: string) {
    await processProfile(datasetId, sheetId);
  }

  async semanticModelNow(datasetId: string) {
    await processSemanticModel(datasetId);
  }

  async dashboardNow(datasetId: string, dashboardId?: string) {
    await processDashboard(datasetId, dashboardId);
  }

  async recoverPendingWork() {
    const pending = await prisma.analyticsDataset.findMany({
      where: {
        deletedAt: null,
        OR: [
          {
            status: "PROCESSING",
            processingStage: "PARSING",
          },
          {
            status: "PROCESSING",
            processingStage: "PERSISTING",
            activeSheetId: { not: null },
          },
          {
            status: "PROFILING",
            processingStage: "PROFILING",
            activeSheetId: { not: null },
          },
        ],
      },
      select: { id: true, processingStage: true, activeSheetId: true },
    });
    let queued = 0;
    for (const dataset of pending) {
      const accepted =
        dataset.processingStage === "PROFILING" && dataset.activeSheetId
          ? this.enqueueProfile(dataset.id, dataset.activeSheetId)
          : dataset.processingStage === "PERSISTING" && dataset.activeSheetId
            ? this.enqueueSheet(dataset.id, dataset.activeSheetId)
            : this.enqueueDiscovery(dataset.id);
      if (accepted) queued += 1;
    }
    const semanticCandidates = await prisma.analyticsDataset.findMany({
      where: {
        deletedAt: null,
        status: "ANALYZING",
        processingStage: "UNDERSTANDING",
      },
      select: {
        id: true,
        processingEvents: {
          select: { stage: true, status: true },
          orderBy: { sequence: "desc" },
          take: 1,
        },
      },
    });
    for (const dataset of semanticCandidates) {
      const latest = dataset.processingEvents[0];
      if (
        latest?.stage === "UNDERSTANDING" &&
        latest.status === "STARTED" &&
        this.enqueueSemanticModel(dataset.id)
      ) {
        queued += 1;
      }
    }
    const dashboardCandidates = await prisma.analyticsDataset.findMany({
      where: {
        deletedAt: null,
        status: "GENERATING",
        processingStage: "DASHBOARD_PLANNING",
        semanticModelVersion: { gt: 0 },
      },
      select: { id: true },
    });
    for (const dataset of dashboardCandidates) {
      if (this.enqueueDashboard(dataset.id)) queued += 1;
    }
    return queued;
  }
}

export const analyticsProcessingWorker = new AnalyticsProcessingWorker();
