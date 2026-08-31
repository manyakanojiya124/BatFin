import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import { TextDecoder } from "node:util";

import type { Prisma } from "@prisma/client";

import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";
import { analyticsAIService } from "./analytics-ai.service.js";
import { createAnalyticsContext } from "./analytics-context.service.js";
import { analyticsProcessingWorker } from "./analytics-processing.worker.js";
import { analyticsFileStorage } from "./analytics-storage.service.js";

const datasetStatuses = [
  "UPLOADING",
  "PROCESSING",
  "PROFILING",
  "ANALYZING",
  "GENERATING",
  "READY",
  "FAILED",
] as const;

type AnalyticsFileType = "CSV" | "XLSX" | "XLS";

const fileSelect = {
  id: true,
  version: true,
  originalFileName: true,
  safeFileName: true,
  fileType: true,
  mimeType: true,
  sizeBytes: true,
  sha256: true,
  storageProvider: true,
  status: true,
  isCurrent: true,
  sheetCount: true,
  deletedAt: true,
  createdAt: true,
} as const;

const datasetListSelect = {
  id: true,
  ownerAdminId: true,
  name: true,
  description: true,
  status: true,
  processingStage: true,
  processingMessage: true,
  activeSheetId: true,
  rowCount: true,
  columnCount: true,
  datasetVersion: true,
  semanticModelVersion: true,
  processingAttempt: true,
  processingStartedAt: true,
  processingHeartbeatAt: true,
  lastAnalyzedAt: true,
  failureCode: true,
  failureMessage: true,
  createdAt: true,
  updatedAt: true,
  files: {
    where: { isCurrent: true },
    take: 1,
    select: fileSelect,
  },
  _count: {
    select: { sheets: true, dashboards: true },
  },
} as const;

type DatasetListRecord = Prisma.AnalyticsDatasetGetPayload<{
  select: typeof datasetListSelect;
}>;

function requiredAdminId(value: string | undefined) {
  if (!value) {
    throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  }
  return value;
}

function boundedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
  optional = false,
) {
  if ((value === undefined || value === null || value === "") && optional) {
    return null;
  }
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ApiError(
      400,
      `${label} must be between ${minimum} and ${maximum} characters`,
      "VALIDATION_ERROR",
    );
  }
  return normalized;
}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new ApiError(400, "Invalid pagination value", "VALIDATION_ERROR");
  }
  return parsed;
}

function optionalStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !datasetStatuses.includes(value.toUpperCase() as (typeof datasetStatuses)[number])
  ) {
    throw new ApiError(400, "Invalid analytics dataset status", "VALIDATION_ERROR");
  }
  return value.toUpperCase() as (typeof datasetStatuses)[number];
}

function searchQuery(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "Search query must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim();
  if (normalized.length > 100) {
    throw new ApiError(400, "Search query is too long", "VALIDATION_ERROR");
  }
  return normalized || undefined;
}

function originalBaseName(value: string) {
  return path.posix.basename(value.replace(/\\/g, "/"));
}

function sanitizedFileName(originalName: string, extension: string) {
  const baseName = originalBaseName(originalName);
  const source = path.basename(baseName, path.extname(baseName));
  const normalized = source
    .normalize("NFKC")
    .replace(/[^A-Za-z0-9._ -]/g, "_")
    .replace(/\s+/g, " ")
    .replace(/^\.+/, "")
    .trim()
    .slice(0, 180);
  return `${normalized || "dataset"}${extension}`;
}

function defaultDatasetName(originalName: string) {
  const baseName = originalBaseName(originalName);
  const source = path.basename(baseName, path.extname(baseName));
  const normalized = source
    .normalize("NFKC")
    .replace(/[_-]+/g, " ")
    .replace(/[^\p{L}\p{N} .()]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized.length >= 2 ? normalized : "Uploaded Dataset";
}

function startsWith(buffer: Buffer, signature: number[]) {
  return signature.every((byte, index) => buffer[index] === byte);
}

function detectFile(file: Express.Multer.File | undefined) {
  if (!file) {
    throw new ApiError(400, "A CSV or Excel file is required", "VALIDATION_ERROR");
  }
  if (file.size < 1 || file.buffer.length < 1) {
    throw new ApiError(400, "Uploaded file is empty", "EMPTY_ANALYTICS_FILE");
  }
  if (file.size > env.analyticsMaxFileBytes) {
    throw new ApiError(
      413,
      `File exceeds the configured ${Math.floor(env.analyticsMaxFileBytes / 1024 / 1024)} MB limit`,
      "ANALYTICS_FILE_TOO_LARGE",
    );
  }
  const extension = path.extname(originalBaseName(file.originalname)).toLowerCase();
  let fileType: AnalyticsFileType;
  if (extension === ".csv") {
    fileType = "CSV";
    if (file.buffer.includes(0)) {
      throw new ApiError(415, "CSV contains binary null bytes", "INVALID_ANALYTICS_FILE");
    }
    try {
      new TextDecoder("utf-8", { fatal: true }).decode(file.buffer);
    } catch {
      throw new ApiError(415, "CSV must be UTF-8 encoded", "INVALID_ANALYTICS_FILE");
    }
  } else if (extension === ".xlsx") {
    fileType = "XLSX";
    if (!startsWith(file.buffer, [0x50, 0x4b, 0x03, 0x04])) {
      throw new ApiError(415, "XLSX file does not have a valid ZIP signature", "INVALID_ANALYTICS_FILE");
    }
  } else if (extension === ".xls") {
    fileType = "XLS";
    if (
      !startsWith(file.buffer, [
        0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1,
      ])
    ) {
      throw new ApiError(415, "XLS file does not have a valid OLE signature", "INVALID_ANALYTICS_FILE");
    }
  } else {
    throw new ApiError(
      415,
      "Only CSV, XLSX, and XLS files are supported",
      "UNSUPPORTED_ANALYTICS_FILE_TYPE",
    );
  }

  const acceptedMimeTypes: Record<AnalyticsFileType, Set<string>> = {
    CSV: new Set([
      "text/csv",
      "application/csv",
      "text/plain",
      "application/vnd.ms-excel",
      "application/octet-stream",
    ]),
    XLSX: new Set([
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/zip",
      "application/octet-stream",
    ]),
    XLS: new Set([
      "application/vnd.ms-excel",
      "application/octet-stream",
    ]),
  };
  const mimeType = (file.mimetype || "application/octet-stream")
    .split(";", 1)[0]!
    .trim()
    .toLowerCase();
  if (!acceptedMimeTypes[fileType].has(mimeType)) {
    throw new ApiError(
      415,
      `MIME type ${mimeType} is not valid for ${fileType}`,
      "INVALID_ANALYTICS_MIME_TYPE",
    );
  }
  return {
    file,
    fileType,
    extension,
    mimeType,
    sha256: createHash("sha256").update(file.buffer).digest("hex"),
    safeFileName: sanitizedFileName(file.originalname, extension),
  };
}

function serializeFile(file: DatasetListRecord["files"][number]) {
  return { ...file, sizeBytes: Number(file.sizeBytes) };
}

function serializeListDataset(dataset: DatasetListRecord) {
  return {
    ...dataset,
    file: dataset.files[0] ? serializeFile(dataset.files[0]) : null,
    files: undefined,
    sheetCount: dataset._count.sheets,
    dashboardCount: dataset._count.dashboards,
    _count: undefined,
  };
}

async function ownedDataset(datasetId: string, adminUserId: string) {
  const dataset = await prisma.analyticsDataset.findFirst({
    where: { id: datasetId, ownerAdminId: adminUserId, deletedAt: null },
  });
  if (!dataset) {
    throw new ApiError(404, "Analytics dataset not found", "ANALYTICS_DATASET_NOT_FOUND");
  }
  return dataset;
}

async function upload(
  adminUserIdValue: string | undefined,
  fileValue: Express.Multer.File | undefined,
  input: { name?: unknown; description?: unknown },
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const detected = detectFile(fileValue);
  const name =
    input.name === undefined || input.name === ""
      ? defaultDatasetName(detected.file.originalname)
      : boundedText(input.name, "Dataset name", 2, 120)!;
  const description = boundedText(
    input.description,
    "Dataset description",
    2,
    1000,
    true,
  );
  const datasetId = randomUUID();
  const fileId = randomUUID();
  const storageKey = [
    "owners",
    adminUserId,
    "datasets",
    datasetId,
    "files",
    "v1",
    `${randomUUID()}${detected.extension}`,
  ].join("/");
  const now = new Date();

  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.create({
      data: {
        id: datasetId,
        ownerAdminId: adminUserId,
        name,
        description,
        status: "UPLOADING",
        processingStage: "UPLOAD",
        processingMessage: "Saving source file",
        processingAttempt: 1,
        processingStartedAt: now,
        processingHeartbeatAt: now,
      },
    });
    await transaction.analyticsDatasetFile.create({
      data: {
        id: fileId,
        datasetId,
        version: 1,
        originalFileName: originalBaseName(detected.file.originalname).slice(0, 255),
        safeFileName: detected.safeFileName,
        fileType: detected.fileType,
        mimeType: detected.mimeType,
        sizeBytes: BigInt(detected.file.size),
        sha256: detected.sha256,
        storageProvider: analyticsFileStorage.provider,
        storageKey,
        status: "PENDING",
      },
      select: fileSelect,
    });
    await transaction.analyticsProcessingEvent.create({
      data: {
        datasetId,
        sequence: 1,
        stage: "UPLOAD",
        status: "STARTED",
        message: "Source file upload started",
        details: {
          fileType: detected.fileType,
          sizeBytes: detected.file.size,
        },
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_DATASET_UPLOAD_STARTED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          fileType: detected.fileType,
          sizeBytes: detected.file.size,
          sha256: detected.sha256,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });

  try {
    await analyticsFileStorage.save(storageKey, detected.file.buffer);
    const finalized = await prisma.$transaction(async (transaction) => {
      const file = await transaction.analyticsDatasetFile.update({
        where: { id: fileId },
        data: { status: "STORED" },
        select: fileSelect,
      });
      const dataset = await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          status: "PROCESSING",
          processingStage: "PARSING",
          processingMessage: "Source file stored; awaiting dataset parser",
          processingHeartbeatAt: new Date(),
        },
      });
      await transaction.analyticsProcessingEvent.create({
        data: {
          datasetId,
          sequence: 2,
          stage: "UPLOAD",
          status: "COMPLETED",
          message: "Source file stored securely",
          details: {
            storageProvider: analyticsFileStorage.provider,
            sha256: detected.sha256,
          },
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId,
          action: "ANALYTICS_DATASET_UPLOADED",
          resourceType: "AnalyticsDataset",
          resourceId: datasetId,
          metadata: {
            fileType: detected.fileType,
            sizeBytes: detected.file.size,
            sha256: detected.sha256,
            datasetVersion: 1,
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
      return { dataset, file };
    });
    analyticsProcessingWorker.enqueueDiscovery(datasetId);
    return {
      dataset: {
        ...finalized.dataset,
        file: serializeFile(finalized.file as DatasetListRecord["files"][number]),
      },
    };
  } catch (error) {
    await analyticsFileStorage.delete(storageKey).catch(() => undefined);
    await prisma
      .$transaction(async (transaction) => {
        await transaction.analyticsDatasetFile.updateMany({
          where: { id: fileId },
          data: { status: "FAILED", isCurrent: false },
        });
        await transaction.analyticsDataset.updateMany({
          where: { id: datasetId },
          data: {
            status: "FAILED",
            processingStage: "FAILED",
            processingMessage: "Source file could not be stored",
            failureCode: "UPLOAD_STORAGE_FAILED",
            failureMessage: "Source file storage failed",
            processingHeartbeatAt: new Date(),
          },
        });
        await transaction.analyticsProcessingEvent.create({
          data: {
            datasetId,
            sequence: 2,
            stage: "UPLOAD",
            status: "FAILED",
            message: "Source file storage failed",
          },
        });
        await transaction.adminAuditLog.create({
          data: {
            adminUserId,
            action: "ANALYTICS_DATASET_UPLOAD_FAILED",
            resourceType: "AnalyticsDataset",
            resourceId: datasetId,
            metadata: {
              reason: "storage_failure",
              fileType: detected.fileType,
              sizeBytes: detected.file.size,
            },
            ipAddress: context.ipAddress ?? null,
            userAgent: context.userAgent ?? null,
            success: false,
          },
        });
      })
      .catch(() => undefined);
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Source file could not be stored",
      "ANALYTICS_STORAGE_FAILED",
    );
  }
}

async function list(
  adminUserIdValue: string | undefined,
  input: { q?: unknown; status?: unknown; page?: unknown; pageSize?: unknown },
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const q = searchQuery(input.q);
  const status = optionalStatus(input.status);
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 20, 100);
  const where: Prisma.AnalyticsDatasetWhereInput = {
    ownerAdminId: adminUserId,
    deletedAt: null,
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            {
              files: {
                some: {
                  originalFileName: { contains: q, mode: "insensitive" },
                },
              },
            },
          ],
        }
      : {}),
  };
  const [datasets, total] = await Promise.all([
    prisma.analyticsDataset.findMany({
      where,
      select: datasetListSelect,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.analyticsDataset.count({ where }),
  ]);
  return {
    datasets: datasets.map(serializeListDataset),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getById(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  await ownedDataset(datasetId, adminUserId);
  const dataset = await prisma.analyticsDataset.findUniqueOrThrow({
    where: { id: datasetId },
    select: {
      ...datasetListSelect,
      files: {
        orderBy: { version: "desc" },
        select: fileSelect,
      },
      activeSheet: {
        select: {
          id: true,
          name: true,
          sheetIndex: true,
          status: true,
          sourceRowCount: true,
          normalizedRowCount: true,
          columnCount: true,
          detectedHeaderRow: true,
          dataStartRow: true,
          recommendedAsPrimary: true,
        },
      },
    },
  });
  return {
    ...dataset,
    files: dataset.files.map(serializeFile),
    sheetCount: dataset._count.sheets,
    dashboardCount: dataset._count.dashboards,
    _count: undefined,
  };
}

async function status(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  const events = await prisma.analyticsProcessingEvent.findMany({
    where: { datasetId },
    select: {
      id: true,
      sequence: true,
      stage: true,
      status: true,
      message: true,
      details: true,
      createdAt: true,
    },
    orderBy: { sequence: "asc" },
  });
  return {
    datasetId: dataset.id,
    status: dataset.status,
    stage: dataset.processingStage,
    message: dataset.processingMessage,
    rowCount: dataset.rowCount,
    columnCount: dataset.columnCount,
    datasetVersion: dataset.datasetVersion,
    semanticModelVersion: dataset.semanticModelVersion,
    processingAttempt: dataset.processingAttempt,
    processingStartedAt: dataset.processingStartedAt,
    processingHeartbeatAt: dataset.processingHeartbeatAt,
    lastAnalyzedAt: dataset.lastAnalyzedAt,
    failure:
      dataset.status === "FAILED"
        ? {
            code: dataset.failureCode,
            message: dataset.failureMessage,
          }
        : null,
    events,
    limits: {
      maxFileBytes: env.analyticsMaxFileBytes,
      maxRows: env.analyticsMaxRows,
      maxColumns: env.analyticsMaxColumns,
      maxSheets: env.analyticsMaxSheets,
      headerScanRows: env.analyticsHeaderScanRows,
      analysisTimeoutMs: env.analyticsAnalysisTimeoutMs,
    },
  };
}

async function listSheets(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  const sheets = await prisma.analyticsDatasetSheet.findMany({
    where: {
      datasetId,
      file: { isCurrent: true, status: "STORED", deletedAt: null },
    },
    select: {
      id: true,
      name: true,
      sheetIndex: true,
      status: true,
      sourceRowCount: true,
      normalizedRowCount: true,
      columnCount: true,
      detectedHeaderRow: true,
      dataStartRow: true,
      recommendedAsPrimary: true,
      recommendationScore: true,
      recommendationReason: true,
      metadata: true,
      sampleRows: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { sheetIndex: "asc" },
  });
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      status: dataset.status,
      stage: dataset.processingStage,
      activeSheetId: dataset.activeSheetId,
    },
    sheets: sheets.map((sheet) => ({
      ...sheet,
      recommendationScore:
        sheet.recommendationScore === null
          ? null
          : Number(sheet.recommendationScore),
    })),
  };
}

async function selectSheet(
  datasetId: string,
  sheetId: string,
  adminUserIdValue: string | undefined,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  const sheet = await prisma.analyticsDatasetSheet.findFirst({
    where: {
      id: sheetId,
      datasetId,
      file: { isCurrent: true, status: "STORED", deletedAt: null },
    },
    select: { id: true, name: true, sheetIndex: true },
  });
  if (!sheet) {
    throw new ApiError(
      404,
      "Analytics worksheet not found",
      "ANALYTICS_SHEET_NOT_FOUND",
    );
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data: {
        activeSheetId: sheet.id,
        status: "PROCESSING",
        processingStage: "PERSISTING",
        processingMessage: `Worksheet ${sheet.name} selected for normalization`,
        processingHeartbeatAt: new Date(),
        processingAttempt: { increment: 1 },
        failureCode: null,
        failureMessage: null,
      },
    });
    await transaction.analyticsDatasetSheet.updateMany({
      where: { datasetId, status: "SELECTED", id: { not: sheet.id } },
      data: { status: "DISCOVERED" },
    });
    await transaction.analyticsDatasetSheet.update({
      where: { id: sheet.id },
      data: { status: "SELECTED" },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_SHEET_SELECTION_REQUESTED",
        resourceType: "AnalyticsDatasetSheet",
        resourceId: sheet.id,
        metadata: {
          datasetId,
          sheetIndex: sheet.sheetIndex,
          datasetVersion: dataset.datasetVersion,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });
  if (!analyticsProcessingWorker.enqueueSheet(datasetId, sheet.id)) {
    throw new ApiError(
      409,
      "Dataset processing is already running",
      "ANALYTICS_PROCESSING_IN_PROGRESS",
    );
  }
  return {
    accepted: true,
    datasetId,
    sheetId: sheet.id,
    status: "PROCESSING",
    stage: "PERSISTING",
  };
}

async function preview(
  datasetId: string,
  adminUserIdValue: string | undefined,
  input: { page?: unknown; pageSize?: unknown },
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  if (!dataset.activeSheetId) {
    throw new ApiError(
      409,
      "Select and normalize a worksheet before requesting data preview",
      "ANALYTICS_SHEET_SELECTION_REQUIRED",
    );
  }
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 50, 100);
  const where = {
    datasetId,
    sheetId: dataset.activeSheetId,
    datasetVersion: dataset.datasetVersion,
  };
  const [columns, rows, total] = await Promise.all([
    prisma.analyticsDatasetColumn.findMany({
      where: { datasetId, sheetId: dataset.activeSheetId },
      select: {
        id: true,
        ordinal: true,
        originalName: true,
        normalizedName: true,
        displayName: true,
        dataType: true,
        semanticType: true,
        nullable: true,
        sampleValues: true,
      },
      orderBy: { ordinal: "asc" },
    }),
    prisma.analyticsDatasetRow.findMany({
      where,
      select: { id: true, rowNumber: true, data: true },
      orderBy: { rowNumber: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.analyticsDatasetRow.count({ where }),
  ]);
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      datasetVersion: dataset.datasetVersion,
      activeSheetId: dataset.activeSheetId,
      rowCount: dataset.rowCount,
      columnCount: dataset.columnCount,
    },
    columns,
    rows,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getProfile(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  if (!dataset.activeSheetId) {
    throw new ApiError(
      409,
      "Dataset does not have an active worksheet",
      "ANALYTICS_SHEET_SELECTION_REQUIRED",
    );
  }
  const profile = await prisma.analyticsDatasetProfile.findUnique({
    where: {
      datasetId_datasetVersion_sheetId: {
        datasetId,
        datasetVersion: dataset.datasetVersion,
        sheetId: dataset.activeSheetId,
      },
    },
    select: {
      id: true,
      datasetId: true,
      sheetId: true,
      datasetVersion: true,
      rowCount: true,
      columnCount: true,
      duplicateRowCount: true,
      profile: true,
      sampleRows: true,
      dataQualityWarnings: true,
      detectedDateRanges: true,
      detectedRelationships: true,
      createdAt: true,
    },
  });
  if (!profile) {
    throw new ApiError(
      409,
      "Dataset profile is not ready",
      "ANALYTICS_PROFILE_NOT_READY",
    );
  }
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      status: dataset.status,
      stage: dataset.processingStage,
      datasetVersion: dataset.datasetVersion,
      activeSheetId: dataset.activeSheetId,
    },
    profile,
  };
}

async function updateMetadata(
  datasetId: string,
  adminUserIdValue: string | undefined,
  input: { name?: unknown; description?: unknown },
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const current = await ownedDataset(datasetId, adminUserId);
  const data: Prisma.AnalyticsDatasetUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    data.name = boundedText(input.name, "Dataset name", 2, 120)!;
  }
  if (Object.prototype.hasOwnProperty.call(input, "description")) {
    data.description = boundedText(
      input.description,
      "Dataset description",
      2,
      1000,
      true,
    );
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(
      400,
      "Dataset name or description is required",
      "VALIDATION_ERROR",
    );
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_DATASET_METADATA_UPDATED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          previousName: current.name,
          newName:
            typeof data.name === "string" ? data.name : current.name,
          descriptionChanged: Object.prototype.hasOwnProperty.call(
            data,
            "description",
          ),
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });
  return getById(datasetId, adminUserId);
}

async function history(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  const [files, profiles, semanticModels, dashboards] = await Promise.all([
    prisma.analyticsDatasetFile.findMany({
      where: { datasetId },
      select: {
        ...fileSelect,
        sheets: {
          select: {
            id: true,
            name: true,
            sheetIndex: true,
            status: true,
            sourceRowCount: true,
            normalizedRowCount: true,
            columnCount: true,
            detectedHeaderRow: true,
            recommendedAsPrimary: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { sheetIndex: "asc" },
        },
      },
      orderBy: { version: "desc" },
    }),
    prisma.analyticsDatasetProfile.findMany({
      where: { datasetId },
      select: {
        id: true,
        sheetId: true,
        datasetVersion: true,
        rowCount: true,
        columnCount: true,
        duplicateRowCount: true,
        createdAt: true,
      },
      orderBy: [{ datasetVersion: "desc" }, { createdAt: "desc" }],
    }),
    prisma.analyticsSemanticModel.findMany({
      where: { datasetId },
      select: {
        id: true,
        datasetVersion: true,
        version: true,
        source: true,
        provider: true,
        providerModel: true,
        schemaVersion: true,
        createdAt: true,
      },
      orderBy: { version: "desc" },
    }),
    prisma.analyticsDashboard.findMany({
      where: { datasetId },
      select: {
        id: true,
        title: true,
        status: true,
        currentVersionId: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { versions: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return {
    dataset: {
      id: dataset.id,
      name: dataset.name,
      datasetVersion: dataset.datasetVersion,
      semanticModelVersion: dataset.semanticModelVersion,
      status: dataset.status,
      stage: dataset.processingStage,
      activeSheetId: dataset.activeSheetId,
      createdAt: dataset.createdAt,
      updatedAt: dataset.updatedAt,
    },
    files: files.map((file) => ({
      ...file,
      sizeBytes: Number(file.sizeBytes),
    })),
    profiles,
    semanticModels,
    dashboards: dashboards.map(({ _count, ...dashboard }) => ({
      ...dashboard,
      versionCount: _count.versions,
    })),
  };
}

async function verifySourceIntegrity(
  datasetId: string,
  adminUserIdValue: string | undefined,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  await ownedDataset(datasetId, adminUserId);
  const file = await prisma.analyticsDatasetFile.findFirst({
    where: {
      datasetId,
      isCurrent: true,
      status: "STORED",
      deletedAt: null,
    },
  });
  if (!file) {
    throw new ApiError(
      409,
      "Dataset has no stored current source file",
      "ANALYTICS_SOURCE_NOT_FOUND",
    );
  }
  let actualHash: string;
  let actualSize: number;
  try {
    const content = await analyticsFileStorage.read(file.storageKey);
    actualHash = createHash("sha256").update(content).digest("hex");
    actualSize = content.length;
  } catch {
    await recordAdminAudit({
      adminUserId,
      action: "ANALYTICS_SOURCE_INTEGRITY_FAILED",
      resourceType: "AnalyticsDatasetFile",
      resourceId: file.id,
      metadata: { datasetId, fileVersion: file.version, reason: "unreadable" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(
      409,
      "Stored dataset source is unavailable",
      "ANALYTICS_SOURCE_UNAVAILABLE",
    );
  }
  const verified =
    actualHash === file.sha256 && actualSize === Number(file.sizeBytes);
  await recordAdminAudit({
    adminUserId,
    action: verified
      ? "ANALYTICS_SOURCE_INTEGRITY_VERIFIED"
      : "ANALYTICS_SOURCE_INTEGRITY_FAILED",
    resourceType: "AnalyticsDatasetFile",
    resourceId: file.id,
    metadata: {
      datasetId,
      fileVersion: file.version,
      hashMatches: actualHash === file.sha256,
      sizeMatches: actualSize === Number(file.sizeBytes),
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    success: verified,
  });
  if (!verified) {
    throw new ApiError(
      409,
      "Stored dataset source failed integrity verification",
      "ANALYTICS_SOURCE_INTEGRITY_FAILED",
    );
  }
  return {
    verified: true,
    datasetId,
    file: {
      id: file.id,
      version: file.version,
      originalFileName: file.originalFileName,
      fileType: file.fileType,
      sizeBytes: actualSize,
      sha256: actualHash,
      storageProvider: file.storageProvider,
    },
    verifiedAt: new Date(),
  };
}

async function analysisContext(
  datasetId: string,
  adminUserIdValue: string | undefined,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  if (!dataset.activeSheetId) {
    throw new ApiError(
      409,
      "Dataset has no active worksheet",
      "ANALYTICS_SHEET_SELECTION_REQUIRED",
    );
  }
  const [sheet, profile] = await Promise.all([
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
  ]);
  if (!sheet || !profile) {
    throw new ApiError(
      409,
      "Dataset profile is not ready for analysis",
      "ANALYTICS_PROFILE_NOT_READY",
    );
  }
  const result = createAnalyticsContext({
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
  await recordAdminAudit({
    adminUserId,
    action: "ANALYTICS_CONTEXT_PREPARED",
    resourceType: "AnalyticsDatasetProfile",
    resourceId: profile.id,
    metadata: {
      datasetId,
      datasetVersion: dataset.datasetVersion,
      contextBytes: result.sizeBytes,
      contextSha256: result.sha256,
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return {
    datasetId,
    datasetVersion: dataset.datasetVersion,
    context: result.context,
    sizeBytes: result.sizeBytes,
    sha256: result.sha256,
  };
}

async function refreshSource(
  datasetId: string,
  adminUserIdValue: string | undefined,
  fileValue: Express.Multer.File | undefined,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  if (["UPLOADING", "PROCESSING", "PROFILING", "GENERATING"].includes(dataset.status)) {
    throw new ApiError(
      409,
      "Dataset is already processing",
      "ANALYTICS_PROCESSING_IN_PROGRESS",
    );
  }
  const detected = detectFile(fileValue);
  const currentFile = await prisma.analyticsDatasetFile.findFirst({
    where: { datasetId, isCurrent: true, status: "STORED", deletedAt: null },
    orderBy: { version: "desc" },
  });
  if (!currentFile) {
    throw new ApiError(
      409,
      "Dataset has no current source file",
      "ANALYTICS_SOURCE_NOT_FOUND",
    );
  }
  if (currentFile.sha256 === detected.sha256) {
    throw new ApiError(
      409,
      "Uploaded source is identical to the current dataset version",
      "ANALYTICS_SOURCE_UNCHANGED",
    );
  }
  const nextVersion = dataset.datasetVersion + 1;
  const fileId = randomUUID();
  const storageKey = [
    "owners",
    adminUserId,
    "datasets",
    datasetId,
    "files",
    `v${nextVersion}`,
    `${randomUUID()}${detected.extension}`,
  ].join("/");
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDatasetFile.create({
      data: {
        id: fileId,
        datasetId,
        version: nextVersion,
        originalFileName: originalBaseName(detected.file.originalname).slice(0, 255),
        safeFileName: detected.safeFileName,
        fileType: detected.fileType,
        mimeType: detected.mimeType,
        sizeBytes: BigInt(detected.file.size),
        sha256: detected.sha256,
        storageProvider: analyticsFileStorage.provider,
        storageKey,
        status: "PENDING",
        isCurrent: false,
      },
    });
    const sequence = await transaction.analyticsProcessingEvent.aggregate({
      where: { datasetId },
      _max: { sequence: true },
    });
    await transaction.analyticsProcessingEvent.create({
      data: {
        datasetId,
        sequence: (sequence._max.sequence ?? 0) + 1,
        stage: "UPLOAD",
        status: "STARTED",
        message: `Dataset version ${nextVersion} source refresh started`,
        details: {
          datasetVersion: nextVersion,
          fileType: detected.fileType,
          sizeBytes: detected.file.size,
        },
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_DATASET_REFRESH_STARTED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          previousDatasetVersion: dataset.datasetVersion,
          newDatasetVersion: nextVersion,
          fileType: detected.fileType,
          sizeBytes: detected.file.size,
          sha256: detected.sha256,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });

  try {
    await analyticsFileStorage.save(storageKey, detected.file.buffer);
    await prisma.$transaction(async (transaction) => {
      await transaction.analyticsDatasetFile.updateMany({
        where: { datasetId, isCurrent: true },
        data: { isCurrent: false },
      });
      await transaction.analyticsDatasetFile.update({
        where: { id: fileId },
        data: { status: "STORED", isCurrent: true },
      });
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          activeSheetId: null,
          status: "PROCESSING",
          processingStage: "PARSING",
          processingMessage: `Dataset version ${nextVersion} source stored; parsing queued`,
          rowCount: 0,
          columnCount: 0,
          datasetVersion: nextVersion,
          semanticModelVersion: 0,
          processingAttempt: { increment: 1 },
          processingStartedAt: new Date(),
          processingHeartbeatAt: new Date(),
          lastAnalyzedAt: null,
          failureCode: null,
          failureMessage: null,
        },
      });
      const sequence = await transaction.analyticsProcessingEvent.aggregate({
        where: { datasetId },
        _max: { sequence: true },
      });
      await transaction.analyticsProcessingEvent.create({
        data: {
          datasetId,
          sequence: (sequence._max.sequence ?? 0) + 1,
          stage: "UPLOAD",
          status: "COMPLETED",
          message: `Dataset version ${nextVersion} source stored`,
          details: {
            datasetVersion: nextVersion,
            sha256: detected.sha256,
          },
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId,
          action: "ANALYTICS_DATASET_REFRESHED",
          resourceType: "AnalyticsDataset",
          resourceId: datasetId,
          metadata: {
            previousDatasetVersion: dataset.datasetVersion,
            newDatasetVersion: nextVersion,
            sha256: detected.sha256,
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
    });
  } catch (error) {
    await analyticsFileStorage.delete(storageKey).catch(() => undefined);
    await prisma.analyticsDatasetFile.updateMany({
      where: { id: fileId, status: "PENDING" },
      data: { status: "FAILED", isCurrent: false },
    });
    await recordAdminAudit({
      adminUserId,
      action: "ANALYTICS_DATASET_REFRESH_FAILED",
      resourceType: "AnalyticsDataset",
      resourceId: datasetId,
      metadata: {
        attemptedDatasetVersion: nextVersion,
        reason: "source_storage_or_commit_failed",
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      500,
      "Dataset source refresh could not be stored",
      "ANALYTICS_REFRESH_FAILED",
    );
  }
  analyticsProcessingWorker.enqueueDiscovery(datasetId);
  return {
    accepted: true,
    datasetId,
    datasetVersion: nextVersion,
    status: "PROCESSING",
    stage: "PARSING",
  };
}

async function requestSemanticAnalysis(
  datasetId: string,
  adminUserIdValue: string | undefined,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  if (!dataset.activeSheetId) {
    throw new ApiError(
      409,
      "Dataset profile is required before semantic analysis",
      "ANALYTICS_PROFILE_NOT_READY",
    );
  }
  const profile = await prisma.analyticsDatasetProfile.findUnique({
    where: {
      datasetId_datasetVersion_sheetId: {
        datasetId,
        datasetVersion: dataset.datasetVersion,
        sheetId: dataset.activeSheetId,
      },
    },
    select: { id: true },
  });
  if (!profile) {
    throw new ApiError(
      409,
      "Dataset profile is not ready",
      "ANALYTICS_PROFILE_NOT_READY",
    );
  }
  if (analyticsProcessingWorker.isRunning(datasetId)) {
    throw new ApiError(
      409,
      "Dataset processing is already running",
      "ANALYTICS_PROCESSING_IN_PROGRESS",
    );
  }
  if (["UPLOADING", "PROCESSING", "PROFILING"].includes(dataset.status)) {
    throw new ApiError(
      409,
      "Dataset is not ready for semantic analysis",
      "ANALYTICS_DATASET_NOT_READY",
    );
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data: {
        status: "ANALYZING",
        processingStage: "UNDERSTANDING",
        processingMessage: "Semantic analysis queued",
        processingAttempt: { increment: 1 },
        processingHeartbeatAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });
    const sequence = await transaction.analyticsProcessingEvent.aggregate({
      where: { datasetId },
      _max: { sequence: true },
    });
    await transaction.analyticsProcessingEvent.create({
      data: {
        datasetId,
        sequence: (sequence._max.sequence ?? 0) + 1,
        stage: "UNDERSTANDING",
        status: "STARTED",
        message: "Semantic analysis started",
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_SEMANTIC_ANALYSIS_REQUESTED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          datasetVersion: dataset.datasetVersion,
          previousSemanticModelVersion: dataset.semanticModelVersion,
          aiProviderConfigured: analyticsAIService.status().configured,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });
  if (!analyticsProcessingWorker.enqueueSemanticModel(datasetId)) {
    throw new ApiError(
      409,
      "Dataset semantic analysis could not be queued",
      "ANALYTICS_PROCESSING_IN_PROGRESS",
    );
  }
  return {
    accepted: true,
    datasetId,
    datasetVersion: dataset.datasetVersion,
    status: "ANALYZING",
    stage: "UNDERSTANDING",
  };
}

async function getCurrentSemanticModel(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  if (dataset.semanticModelVersion < 1) {
    throw new ApiError(
      409,
      "Semantic model is not ready",
      "ANALYTICS_SEMANTIC_MODEL_NOT_READY",
    );
  }
  const semanticModel = await prisma.analyticsSemanticModel.findUnique({
    where: {
      datasetId_version: {
        datasetId,
        version: dataset.semanticModelVersion,
      },
    },
  });
  if (!semanticModel) {
    throw new ApiError(
      409,
      "Current semantic model could not be found",
      "ANALYTICS_SEMANTIC_MODEL_NOT_READY",
    );
  }
  return { datasetId, currentVersion: dataset.semanticModelVersion, semanticModel };
}

async function listSemanticModels(
  datasetId: string,
  adminUserIdValue: string | undefined,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  const semanticModels = await prisma.analyticsSemanticModel.findMany({
    where: { datasetId },
    select: {
      id: true,
      datasetVersion: true,
      version: true,
      source: true,
      provider: true,
      providerModel: true,
      schemaVersion: true,
      semanticModel: true,
      analysisResult: true,
      validationWarnings: true,
      generatedByAdminId: true,
      createdAt: true,
    },
    orderBy: { version: "desc" },
  });
  return {
    datasetId,
    currentVersion: dataset.semanticModelVersion,
    semanticModels: semanticModels.map((model) => ({
      ...model,
      current: model.version === dataset.semanticModelVersion,
    })),
  };
}

async function retryParsing(
  datasetId: string,
  adminUserIdValue: string | undefined,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const dataset = await ownedDataset(datasetId, adminUserId);
  const [profileCount, semanticCount, dashboardCount] = await Promise.all([
    prisma.analyticsDatasetProfile.count({ where: { datasetId } }),
    prisma.analyticsSemanticModel.count({ where: { datasetId } }),
    prisma.analyticsDashboard.count({ where: { datasetId, deletedAt: null } }),
  ]);
  if (profileCount || semanticCount || dashboardCount) {
    throw new ApiError(
      409,
      "Parsing cannot be retried after profiling or dashboard generation",
      "ANALYTICS_RETRY_REQUIRES_NEW_VERSION",
    );
  }
  if (dataset.status !== "FAILED") {
    throw new ApiError(
      409,
      "Only failed datasets can retry source parsing",
      "ANALYTICS_DATASET_NOT_FAILED",
    );
  }
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data: {
        activeSheetId: null,
        status: "PROCESSING",
        processingStage: "PARSING",
        processingMessage: "Source parsing queued for retry",
        processingAttempt: { increment: 1 },
        processingHeartbeatAt: new Date(),
        failureCode: null,
        failureMessage: null,
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_DATASET_PARSE_RETRIED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          datasetVersion: dataset.datasetVersion,
          previousFailureCode: dataset.failureCode,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });
  if (!analyticsProcessingWorker.enqueueDiscovery(datasetId)) {
    throw new ApiError(
      409,
      "Dataset processing is already running",
      "ANALYTICS_PROCESSING_IN_PROGRESS",
    );
  }
  return { accepted: true, datasetId, status: "PROCESSING", stage: "PARSING" };
}

async function remove(
  datasetId: string,
  adminUserIdValue: string | undefined,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const reason = boundedText(reasonValue, "Audit reason", 10, 500)!;
  await ownedDataset(datasetId, adminUserId);
  const files = await prisma.analyticsDatasetFile.findMany({
    where: {
      datasetId,
      status: { in: ["PENDING", "STORED"] },
      deletedAt: null,
    },
    select: { id: true, storageKey: true },
  });
  const removedFiles: Array<{ storageKey: string; content: Buffer }> = [];
  try {
    for (const file of files) {
      const content = await analyticsFileStorage.read(file.storageKey);
      await analyticsFileStorage.delete(file.storageKey);
      removedFiles.push({ storageKey: file.storageKey, content });
    }
  } catch {
    for (const removed of removedFiles) {
      await analyticsFileStorage
        .save(removed.storageKey, removed.content)
        .catch(() => undefined);
    }
    throw new ApiError(
      500,
      "Dataset source files could not be deleted",
      "ANALYTICS_STORAGE_DELETE_FAILED",
    );
  }
  const deletedAt = new Date();
  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: { activeSheetId: null },
      });
      await transaction.analyticsDashboard.deleteMany({
        where: { datasetId },
      });
      await transaction.analyticsSemanticModel.deleteMany({
        where: { datasetId },
      });
      await transaction.analyticsDatasetSheet.deleteMany({
        where: { datasetId },
      });
      await transaction.analyticsDatasetFile.updateMany({
        where: { datasetId, deletedAt: null },
        data: {
          status: "DELETED",
          isCurrent: false,
          deletedAt,
        },
      });
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          deletedAt,
          processingMessage: "Dataset deleted by owner",
          processingHeartbeatAt: deletedAt,
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId,
          action: "ANALYTICS_DATASET_DELETED",
          resourceType: "AnalyticsDataset",
          resourceId: datasetId,
          metadata: {
            reason,
            deletedFileCount: files.length,
            purgedNormalizedData: true,
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
    });
  } catch {
    for (const removed of removedFiles) {
      await analyticsFileStorage
        .save(removed.storageKey, removed.content)
        .catch(() => undefined);
    }
    throw new ApiError(
      500,
      "Dataset deletion could not be committed",
      "ANALYTICS_DELETE_FAILED",
    );
  }
  return { deleted: true, datasetId, deletedAt };
}

async function purge(
  datasetId: string,
  adminUserIdValue: string | undefined,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const adminUserId = requiredAdminId(adminUserIdValue);
  const reason = boundedText(reasonValue, "Audit reason", 10, 500)!;
  if (analyticsProcessingWorker.isRunning(datasetId)) {
    throw new ApiError(409, "Wait for dataset processing to finish before permanent deletion", "ANALYTICS_PROCESSING_IN_PROGRESS");
  }
  const removed = await remove(datasetId, adminUserId, reason, context);
  await prisma.$transaction(async (transaction) => {
    await transaction.analyticsDataset.delete({ where: { id: datasetId } });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "ANALYTICS_DATASET_PERMANENTLY_DELETED",
        resourceType: "AnalyticsDataset",
        resourceId: datasetId,
        metadata: {
          reason,
          softDeletedAt: removed.deletedAt.toISOString(),
          sourceAndNormalizedDataPurged: true,
          auditTombstoneRetained: true,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });
  return {
    permanentlyDeleted: true,
    datasetId,
    deletedAt: removed.deletedAt,
    auditTombstoneRetained: true,
  };
}

async function recoverStaleUploads() {
  const cutoff = new Date(
    Date.now() - env.analyticsStaleUploadMinutes * 60 * 1000,
  );
  const stale = await prisma.analyticsDataset.findMany({
    where: {
      status: "UPLOADING",
      deletedAt: null,
      OR: [
        { processingHeartbeatAt: null },
        { processingHeartbeatAt: { lt: cutoff } },
      ],
    },
    include: {
      files: {
        where: { status: "PENDING" },
        select: { id: true, storageKey: true },
      },
      processingEvents: {
        select: { sequence: true },
        orderBy: { sequence: "desc" },
        take: 1,
      },
    },
  });
  let recovered = 0;
  for (const dataset of stale) {
    try {
      for (const file of dataset.files) {
        await analyticsFileStorage.delete(file.storageKey);
      }
      const now = new Date();
      await prisma.$transaction(async (transaction) => {
        await transaction.analyticsDatasetFile.updateMany({
          where: { datasetId: dataset.id, status: "PENDING" },
          data: { status: "FAILED", isCurrent: false },
        });
        await transaction.analyticsDataset.update({
          where: { id: dataset.id },
          data: {
            status: "FAILED",
            processingStage: "FAILED",
            processingMessage: "Interrupted upload was recovered",
            failureCode: "UPLOAD_INTERRUPTED",
            failureMessage: "Upload was interrupted before source storage completed",
            processingHeartbeatAt: now,
          },
        });
        await transaction.analyticsProcessingEvent.create({
          data: {
            datasetId: dataset.id,
            sequence: (dataset.processingEvents[0]?.sequence ?? 0) + 1,
            stage: "UPLOAD",
            status: "FAILED",
            message: "Interrupted upload recovered as failed",
          },
        });
        await transaction.adminAuditLog.create({
          data: {
            adminUserId: dataset.ownerAdminId,
            action: "ANALYTICS_UPLOAD_RECOVERED_AS_FAILED",
            resourceType: "AnalyticsDataset",
            resourceId: dataset.id,
            metadata: {
              reason: "stale_upload_recovery",
              pendingFileCount: dataset.files.length,
            },
            success: false,
          },
        });
      });
      recovered += 1;
    } catch (error) {
      console.error(
        `Unable to recover stale analytics upload ${dataset.id}:`,
        error instanceof Error ? error.message : "Unknown error",
      );
    }
  }
  return recovered;
}

function aiStatus() {
  return analyticsAIService.status();
}

export const adminAnalyticsService = {
  aiStatus,
  upload,
  list,
  getById,
  status,
  listSheets,
  selectSheet,
  preview,
  getProfile,
  updateMetadata,
  history,
  verifySourceIntegrity,
  analysisContext,
  refreshSource,
  requestSemanticAnalysis,
  getCurrentSemanticModel,
  listSemanticModels,
  retryParsing,
  remove,
  purge,
  recoverStaleUploads,
};
