import { createHash } from "node:crypto";
import path from "node:path";

import { Prisma } from "@prisma/client";
import { parse } from "csv-parse/sync";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit, sanitizeAuditMetadata } from "../admin-audit/admin-audit.service.js";
import {
  masterDatasetDefinitions,
  masterDatasetTypes,
  searchText,
  type MasterDatasetDefinition,
  type NormalizedMasterRow,
} from "./master-data.registry.js";

const MAX_ROWS = 10_000;
const MAX_COLUMNS = 300;
const MAX_CELL_CHARACTERS = 20_000;
const MAX_EXPORT_ROWS = 10_000;

interface ParsedUpload {
  definition: MasterDatasetDefinition;
  fileName: string;
  sourceHash: string;
  headers: string[];
  ignoredHeaders: string[];
  rows: NormalizedMasterRow[];
  issues: Array<{ row: number; message: string }>;
  sourceRowCount: number;
}

function definition(value: unknown) {
  if (typeof value !== "string" || !masterDatasetDefinitions[value]) {
    throw new ApiError(404, "Business-data section not found", "MASTER_DATASET_NOT_FOUND");
  }
  return masterDatasetDefinitions[value]!;
}

function cleanFileName(value: string) {
  const name = path.basename(value).replace(/[^A-Za-z0-9._() -]/g, "_").slice(0, 200);
  return name || "import.csv";
}

function auditReason(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Audit reason is required", "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 10 || normalized.length > 500) {
    throw new ApiError(400, "Audit reason must be between 10 and 500 characters", "VALIDATION_ERROR");
  }
  return normalized;
}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (typeof parsed !== "number" || !Number.isInteger(parsed) || parsed < 1 || parsed > maximum) {
    throw new ApiError(400, "Invalid pagination value", "VALIDATION_ERROR");
  }
  return parsed;
}

function activeFilter(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  throw new ApiError(400, "Active filter must be true or false", "VALIDATION_ERROR");
}

function queryText(value: unknown, maximum = 200) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") throw new ApiError(400, "Search query must be a string", "VALIDATION_ERROR");
  const normalized = value.trim();
  if (normalized.length > maximum) throw new ApiError(400, "Search query is too long", "VALIDATION_ERROR");
  return normalized || undefined;
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, stableValue(item)]),
    );
  }
  return value;
}
function stableJson(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function parseUpload(datasetType: unknown, file: Express.Multer.File | undefined): ParsedUpload {
  const selected = definition(datasetType);
  if (!file) throw new ApiError(400, "A CSV file is required", "VALIDATION_ERROR");
  if (!file.originalname.toLowerCase().endsWith(".csv")) {
    throw new ApiError(400, "Only .csv files are accepted", "VALIDATION_ERROR");
  }
  const sourceHash = createHash("sha256").update(file.buffer).digest("hex");
  const fileName = cleanFileName(file.originalname);
  let matrix: string[][];
  try {
    matrix = parse(file.buffer, {
      bom: true,
      skip_empty_lines: true,
      relax_column_count: false,
      max_record_size: 2_000_000,
    }) as string[][];
  } catch {
    throw new ApiError(400, "CSV parsing failed. Check quoting and column counts.", "INVALID_CSV");
  }
  if (matrix.length === 0) throw new ApiError(400, "CSV file has no header row", "INVALID_CSV");
  const headers = matrix[0]!.map((header) => String(header).trim());
  if (headers.length > MAX_COLUMNS) throw new ApiError(413, `CSV exceeds the ${MAX_COLUMNS}-column limit`, "CSV_LIMIT_EXCEEDED");
  if (new Set(headers).size !== headers.length || headers.some((header) => !header)) {
    throw new ApiError(400, "CSV headers must be non-empty and unique", "INVALID_CSV_HEADERS");
  }
  const sourceRows = matrix.slice(1);
  if (sourceRows.length > MAX_ROWS) throw new ApiError(413, `CSV exceeds the ${MAX_ROWS.toLocaleString("en-IN")}-row limit`, "CSV_LIMIT_EXCEEDED");
  const issues: Array<{ row: number; message: string }> = [];
  const missing = selected.requiredHeaders.filter((header) => !headers.includes(header));
  if (missing.length) issues.push({ row: 1, message: `Missing required headers: ${missing.join(", ")}` });
  if (selected.expectedHeaders) {
    const unexpected = headers.filter((header) => !selected.expectedHeaders!.includes(header));
    if (unexpected.length) issues.push({ row: 1, message: `Unexpected headers: ${unexpected.join(", ")}` });
  }
  const ignoredHeaders = headers.filter((header) => selected.ignoredHeaders?.includes(header) ?? false);
  const rows: NormalizedMasterRow[] = [];
  const seen = new Map<string, number>();
  if (!issues.length) {
    for (let index = 0; index < sourceRows.length; index += 1) {
      const values = sourceRows[index]!;
      const rowNumber = index + 2;
      const tooLarge = values.findIndex((value) => String(value).length > MAX_CELL_CHARACTERS);
      if (tooLarge >= 0) {
        issues.push({ row: rowNumber, message: `${headers[tooLarge]} exceeds ${MAX_CELL_CHARACTERS.toLocaleString("en-IN")} characters` });
        continue;
      }
      const source = Object.fromEntries(headers.map((header, column) => [header, String(values[column] ?? "")])) as Record<string, string>;
      try {
        const normalized = selected.normalize(source, rowNumber);
        if (!normalized.businessKey || normalized.businessKey.length > 500) throw new Error(`Row ${rowNumber}: invalid business key`);
        const previousRow = seen.get(normalized.businessKey);
        if (previousRow) {
          issues.push({ row: rowNumber, message: `Duplicate business key also appears on row ${previousRow}` });
          continue;
        }
        seen.set(normalized.businessKey, rowNumber);
        rows.push(normalized);
      } catch (error) {
        issues.push({ row: rowNumber, message: error instanceof Error ? error.message : "Row validation failed" });
      }
      if (issues.length >= 100) break;
    }
  }
  return { definition: selected, fileName, sourceHash, headers, ignoredHeaders, rows, issues, sourceRowCount: sourceRows.length };
}

function validationResult(parsed: ParsedUpload) {
  return {
    valid: parsed.issues.length === 0,
    datasetType: parsed.definition.type,
    datasetLabel: parsed.definition.label,
    fileName: parsed.fileName,
    sourceHash: parsed.sourceHash,
    sourceRowCount: parsed.sourceRowCount,
    normalizedRowCount: parsed.rows.length,
    headers: parsed.headers,
    ignoredHeaders: parsed.ignoredHeaders,
    privacy: parsed.definition.privacy,
    issues: parsed.issues,
    sample: parsed.rows.slice(0, 3).map((row) => ({
      businessKey: row.businessKey,
      label: row.label,
      active: row.active,
      payload: row.payload,
    })),
  };
}

async function validate(
  datasetType: unknown,
  file: Express.Multer.File | undefined,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const parsed = parseUpload(datasetType, file);
  const result = validationResult(parsed);
  await recordAdminAudit({
    adminUserId,
    action: "MASTER_DATA_IMPORT_VALIDATED",
    resourceType: "MasterDataImportJob",
    metadata: {
      datasetType: parsed.definition.type,
      fileName: parsed.fileName,
      sourceHash: parsed.sourceHash,
      rowCount: parsed.sourceRowCount,
      valid: result.valid,
      issueCount: parsed.issues.length,
      ignoredColumnCount: parsed.ignoredHeaders.length,
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
    success: result.valid,
  });
  return result;
}

async function serializable<T>(operation: (transaction: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        timeout: 120_000,
        maxWait: 10_000,
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034" && attempt < 3) continue;
      throw error;
    }
  }
  throw new ApiError(409, "Concurrent data import rejected", "MASTER_DATA_IMPORT_CONFLICT");
}

async function importFile(
  datasetType: unknown,
  file: Express.Multer.File | undefined,
  reasonValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const reason = auditReason(reasonValue);
  const parsed = parseUpload(datasetType, file);
  const existing = await prisma.masterDataImportJob.findFirst({
    where: { datasetType: parsed.definition.type, sourceHash: parsed.sourceHash, status: "completed" },
    select: { id: true, completedAt: true },
  });
  if (existing) {
    throw new ApiError(409, "This exact file was already imported into this section", "MASTER_DATA_IMPORT_DUPLICATE");
  }
  if (parsed.issues.length) {
    const failed = await prisma.$transaction(async (transaction) => {
      const job = await transaction.masterDataImportJob.create({
        data: {
          datasetType: parsed.definition.type,
          sourceFileName: parsed.fileName,
          sourceHash: parsed.sourceHash,
          sourceRowCount: parsed.sourceRowCount,
          status: "failed",
          errorCount: parsed.issues.length,
          headers: parsed.headers,
          validationIssues: sanitizeAuditMetadata(parsed.issues) as Prisma.InputJsonValue,
          reason,
          importedByAdminId: adminUserId,
          completedAt: new Date(),
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId,
          action: "MASTER_DATA_IMPORT_REJECTED",
          resourceType: "MasterDataImportJob",
          resourceId: job.id,
          metadata: {
            datasetType: parsed.definition.type,
            fileName: parsed.fileName,
            sourceHash: parsed.sourceHash,
            rowCount: parsed.sourceRowCount,
            issueCount: parsed.issues.length,
            reason,
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
          success: false,
        },
      });
      return job;
    });
    throw new ApiError(422, `Import ${failed.id} failed validation with ${parsed.issues.length} issue(s)`, "MASTER_DATA_IMPORT_INVALID");
  }

  return serializable(async (transaction) => {
    const duplicate = await transaction.masterDataImportJob.findFirst({
      where: { datasetType: parsed.definition.type, sourceHash: parsed.sourceHash, status: "completed" },
      select: { id: true },
    });
    if (duplicate) throw new ApiError(409, "This exact file was already imported", "MASTER_DATA_IMPORT_DUPLICATE");
    const job = await transaction.masterDataImportJob.create({
      data: {
        datasetType: parsed.definition.type,
        sourceFileName: parsed.fileName,
        sourceHash: parsed.sourceHash,
        sourceRowCount: parsed.sourceRowCount,
        status: "processing",
        headers: parsed.headers,
        reason,
        importedByAdminId: adminUserId,
      },
    });
    const currents = parsed.rows.length
      ? await transaction.masterDataRecordVersion.findMany({
          where: {
            datasetType: parsed.definition.type,
            businessKey: { in: parsed.rows.map((row) => row.businessKey) },
            isCurrent: true,
          },
        })
      : [];
    const currentByKey = new Map(currents.map((record) => [record.businessKey, record]));
    let insertedCount = 0;
    let updatedCount = 0;
    let unchangedCount = 0;
    for (let index = 0; index < parsed.rows.length; index += 1) {
      const row = parsed.rows[index]!;
      const current = currentByKey.get(row.businessKey);
      if (
        current &&
        stableJson(current.payload) === stableJson(row.payload) &&
        current.label === row.label &&
        current.active === row.active
      ) {
        unchangedCount += 1;
        continue;
      }
      if (current) {
        await transaction.masterDataRecordVersion.update({ where: { id: current.id }, data: { isCurrent: false } });
        updatedCount += 1;
      } else {
        insertedCount += 1;
      }
      await transaction.masterDataRecordVersion.create({
        data: {
          datasetType: parsed.definition.type,
          businessKey: row.businessKey,
          version: (current?.version ?? 0) + 1,
          label: row.label,
          searchText: searchText(row),
          active: row.active,
          payload: row.payload,
          isCurrent: true,
          sourceRowNumber: index + 2,
          sourceImportJobId: job.id,
          importedByAdminId: adminUserId,
        },
      });
    }
    const completedAt = new Date();
    const completed = await transaction.masterDataImportJob.update({
      where: { id: job.id },
      data: {
        status: "completed",
        insertedCount,
        updatedCount,
        unchangedCount,
        completedAt,
      },
      include: { importedBy: { select: { id: true, name: true, email: true } } },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "MASTER_DATA_IMPORTED",
        resourceType: "MasterDataImportJob",
        resourceId: job.id,
        metadata: {
          datasetType: parsed.definition.type,
          fileName: parsed.fileName,
          sourceHash: parsed.sourceHash,
          sourceRowCount: parsed.sourceRowCount,
          insertedCount,
          updatedCount,
          unchangedCount,
          ignoredColumnCount: parsed.ignoredHeaders.length,
          reason,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return completed;
  });
}

async function catalog() {
  const [countGroups, activeGroups, jobs] = await Promise.all([
    prisma.masterDataRecordVersion.groupBy({
      by: ["datasetType"],
      where: { isCurrent: true },
      _count: { _all: true },
    }),
    prisma.masterDataRecordVersion.groupBy({
      by: ["datasetType", "active"],
      where: { isCurrent: true },
      _count: { _all: true },
    }),
    prisma.masterDataImportJob.findMany({
      where: { status: "completed" },
      select: { id: true, datasetType: true, sourceFileName: true, sourceRowCount: true, insertedCount: true, updatedCount: true, unchangedCount: true, completedAt: true },
      orderBy: { completedAt: "desc" },
    }),
  ]);
  const latest = new Map<string, (typeof jobs)[number]>();
  for (const job of jobs) if (!latest.has(job.datasetType)) latest.set(job.datasetType, job);
  const totalByType = Object.fromEntries(countGroups.map((group) => [group.datasetType, group._count._all]));
  const activeByType = Object.fromEntries(activeGroups.filter((group) => group.active === true).map((group) => [group.datasetType, group._count._all]));
  return masterDatasetTypes.map((type) => {
    const item = masterDatasetDefinitions[type]!;
    return {
      type,
      label: item.label,
      description: item.description,
      sourceFileHint: item.sourceFileHint,
      privacy: item.privacy,
      displayColumns: item.displayColumns,
      requiredHeaders: item.requiredHeaders,
      ignoredHeaders: item.ignoredHeaders ?? [],
      recordCount: totalByType[type] ?? 0,
      activeCount: activeByType[type] ?? 0,
      latestImport: latest.get(type) ?? null,
    };
  });
}

async function summary() {
  const sections = await catalog();
  const [versions, imports, failedImports, collectionRecords] = await Promise.all([
    prisma.masterDataRecordVersion.count(),
    prisma.masterDataImportJob.count({ where: { status: "completed" } }),
    prisma.masterDataImportJob.count({ where: { status: "failed" } }),
    prisma.masterDataRecordVersion.findMany({
      where: { datasetType: "collection_mis", isCurrent: true },
      select: { payload: true },
    }),
  ]);
  let closingPos = 0;
  let closingOverdue = 0;
  let delinquentAccounts = 0;
  for (const record of collectionRecords) {
    const payload = record.payload as Record<string, unknown>;
    closingPos += Number(payload.closingPos ?? 0);
    closingOverdue += Number(payload.closingOverdue ?? 0);
    if (Number(payload.closingDpd ?? 0) > 0) delinquentAccounts += 1;
  }
  return {
    sectionCount: sections.length,
    populatedSectionCount: sections.filter((section) => section.recordCount > 0).length,
    currentRecordCount: sections.reduce((sum, section) => sum + section.recordCount, 0),
    versionCount: versions,
    completedImportCount: imports,
    failedImportCount: failedImports,
    restrictedSectionCount: sections.filter((section) => section.privacy === "restricted").length,
    collectionMetrics: {
      accountCount: collectionRecords.length,
      closingPos: Math.round(closingPos * 100) / 100,
      closingOverdue: Math.round(closingOverdue * 100) / 100,
      delinquentAccounts,
    },
  };
}

async function listRecords(
  datasetType: unknown,
  input: { q?: unknown; active?: unknown; page?: unknown; pageSize?: unknown },
) {
  const selected = definition(datasetType);
  const q = queryText(input.q);
  const active = activeFilter(input.active);
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 25, 100);
  const where: Prisma.MasterDataRecordVersionWhereInput = {
    datasetType: selected.type,
    isCurrent: true,
    ...(active !== undefined ? { active } : {}),
    ...(q ? { searchText: { contains: q, mode: "insensitive" } } : {}),
  };
  const [records, total] = await Promise.all([
    prisma.masterDataRecordVersion.findMany({
      where,
      select: {
        id: true, datasetType: true, businessKey: true, version: true, label: true, active: true,
        payload: true, sourceRowNumber: true, sourceImportJobId: true, importedByAdminId: true, createdAt: true,
        sourceImportJob: { select: { id: true, sourceFileName: true, sourceHash: true, completedAt: true } },
        importedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: [{ label: "asc" }, { businessKey: "asc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.masterDataRecordVersion.count({ where }),
  ]);
  return {
    dataset: {
      type: selected.type,
      label: selected.label,
      description: selected.description,
      privacy: selected.privacy,
      displayColumns: selected.displayColumns,
      sourceFileHint: selected.sourceFileHint,
      ignoredHeaders: selected.ignoredHeaders ?? [],
    },
    records,
    pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
  };
}

async function history(datasetType: unknown, businessKeyValue: unknown) {
  const selected = definition(datasetType);
  if (typeof businessKeyValue !== "string" || !businessKeyValue) {
    throw new ApiError(400, "Business key is required", "VALIDATION_ERROR");
  }
  const versions = await prisma.masterDataRecordVersion.findMany({
    where: { datasetType: selected.type, businessKey: businessKeyValue },
    select: {
      id: true, businessKey: true, version: true, label: true, active: true, payload: true, isCurrent: true,
      sourceRowNumber: true, createdAt: true,
      sourceImportJob: { select: { id: true, sourceFileName: true, sourceHash: true, completedAt: true } },
      importedBy: { select: { id: true, name: true, email: true } },
    },
    orderBy: { version: "desc" },
  });
  if (!versions.length) throw new ApiError(404, "Master-data record not found", "MASTER_DATA_RECORD_NOT_FOUND");
  return { dataset: { type: selected.type, label: selected.label }, versions };
}

async function listImports(input: { datasetType?: unknown; status?: unknown; page?: unknown; pageSize?: unknown }) {
  const datasetType = input.datasetType === undefined || input.datasetType === "" ? undefined : definition(input.datasetType).type;
  const status = input.status === undefined || input.status === "" ? undefined : input.status;
  if (status !== undefined && status !== "completed" && status !== "failed") {
    throw new ApiError(400, "Import status must be completed or failed", "VALIDATION_ERROR");
  }
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 25, 100);
  const where = { ...(datasetType ? { datasetType } : {}), ...(status ? { status } : {}) };
  const [jobs, total] = await Promise.all([
    prisma.masterDataImportJob.findMany({
      where,
      include: { importedBy: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.masterDataImportJob.count({ where }),
  ]);
  return { jobs, pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) } };
}

function csvCell(value: unknown) {
  const raw = value === undefined || value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function exportCsv(
  datasetType: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const selected = definition(datasetType);
  const records = await prisma.masterDataRecordVersion.findMany({
    where: { datasetType: selected.type, isCurrent: true },
    select: { businessKey: true, version: true, label: true, active: true, payload: true, sourceImportJobId: true, createdAt: true },
    orderBy: [{ label: "asc" }, { businessKey: "asc" }],
    take: MAX_EXPORT_ROWS + 1,
  });
  if (records.length > MAX_EXPORT_ROWS) throw new ApiError(422, "Export exceeds 10,000 rows", "MASTER_DATA_EXPORT_LIMIT_EXCEEDED");
  const payloadHeaders = [...new Set(records.flatMap((record) => Object.keys(record.payload as Record<string, unknown>)))];
  const headers = ["Business Key", "Version", "Label", "Active", "Import Job ID", "Version Created At", ...payloadHeaders];
  const rows = records.map((record) => {
    const payload = record.payload as Record<string, unknown>;
    return [record.businessKey, record.version, record.label, record.active, record.sourceImportJobId, record.createdAt.toISOString(), ...payloadHeaders.map((header) => payload[header])].map(csvCell).join(",");
  });
  await recordAdminAudit({
    adminUserId,
    action: "MASTER_DATA_EXPORTED",
    resourceType: "MasterDataRecordVersion",
    metadata: { datasetType: selected.type, rowCount: records.length },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return `\uFEFF${headers.map(csvCell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export const adminMasterDataService = {
  validate,
  importFile,
  catalog,
  summary,
  listRecords,
  history,
  listImports,
  exportCsv,
};
