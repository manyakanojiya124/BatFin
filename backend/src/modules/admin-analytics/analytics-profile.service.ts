import { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";

interface ColumnAggregateRow {
  null_count: string;
  unique_count: string;
  numeric_min: string | null;
  numeric_max: string | null;
  numeric_average: string | null;
  date_min: string | null;
  date_max: string | null;
}

interface FrequencyRow {
  value: string;
  count: string;
}

interface DuplicateAggregateRow {
  total_count: string;
  distinct_count: string;
}

interface ProfiledColumn {
  id: string;
  originalName: string;
  normalizedName: string;
  displayName: string;
  dataType: string;
  nullable: boolean;
  uniqueCount: number;
  nullCount: number;
  nullPercentage: number;
  nonNullCount: number;
  cardinalityRatio: number;
  minValue: string | null;
  maxValue: string | null;
  averageValue: string | null;
  sampleValues: Prisma.JsonValue;
  topValues: Array<{ value: string; count: number }>;
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 100 * 10_000) / 10_000;
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1_000_000) / 1_000_000;
}

async function mapConcurrent<T, R>(
  values: T[],
  concurrency: number,
  callback: (value: T, index: number) => Promise<R>,
) {
  const results = new Array<R>(values.length);
  let cursor = 0;
  async function worker() {
    while (cursor < values.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(values[index]!, index);
    }
  }
  await Promise.all(
    Array.from(
      { length: Math.min(concurrency, Math.max(1, values.length)) },
      () => worker(),
    ),
  );
  return results;
}

async function profileColumn(input: {
  datasetId: string;
  sheetId: string;
  datasetVersion: number;
  rowCount: number;
  column: {
    id: string;
    originalName: string;
    normalizedName: string;
    displayName: string;
    dataType: string;
    nullable: boolean;
    sampleValues: Prisma.JsonValue;
  };
}): Promise<ProfiledColumn> {
  const field = input.column.normalizedName;
  const aggregates = await prisma.$queryRaw<ColumnAggregateRow[]>(Prisma.sql`
    SELECT
      COUNT(*) FILTER (
        WHERE NOT (r."data" ? ${field})
           OR r."data" -> ${field} = 'null'::jsonb
      )::text AS null_count,
      COUNT(DISTINCT (r."data" -> ${field})) FILTER (
        WHERE r."data" ? ${field}
          AND r."data" -> ${field} <> 'null'::jsonb
      )::text AS unique_count,
      MIN(
        CASE WHEN jsonb_typeof(r."data" -> ${field}) = 'number'
          THEN (r."data" ->> ${field})::numeric END
      )::text AS numeric_min,
      MAX(
        CASE WHEN jsonb_typeof(r."data" -> ${field}) = 'number'
          THEN (r."data" ->> ${field})::numeric END
      )::text AS numeric_max,
      AVG(
        CASE WHEN jsonb_typeof(r."data" -> ${field}) = 'number'
          THEN (r."data" ->> ${field})::numeric END
      )::text AS numeric_average,
      MIN(
        CASE WHEN jsonb_typeof(r."data" -> ${field}) = 'string'
          THEN r."data" ->> ${field} END
      ) AS date_min,
      MAX(
        CASE WHEN jsonb_typeof(r."data" -> ${field}) = 'string'
          THEN r."data" ->> ${field} END
      ) AS date_max
    FROM "AnalyticsDatasetRow" r
    WHERE r."datasetId" = ${input.datasetId}
      AND r."sheetId" = ${input.sheetId}
      AND r."datasetVersion" = ${input.datasetVersion}
  `);
  const aggregate = aggregates[0];
  if (!aggregate) {
    throw new ApiError(
      500,
      "Column profile query returned no result",
      "ANALYTICS_PROFILE_QUERY_FAILED",
    );
  }
  const nullCount = Number(aggregate.null_count);
  const uniqueCount = Number(aggregate.unique_count);
  const nonNullCount = Math.max(0, input.rowCount - nullCount);
  const isNumeric =
    input.column.dataType === "INTEGER" ||
    input.column.dataType === "DECIMAL";
  const isDate =
    input.column.dataType === "DATE" ||
    input.column.dataType === "DATETIME";
  let topValues: Array<{ value: string; count: number }> = [];
  if (
    uniqueCount > 0 &&
    uniqueCount <= 100 &&
    (input.column.dataType === "STRING" ||
      input.column.dataType === "BOOLEAN")
  ) {
    const frequencies = await prisma.$queryRaw<FrequencyRow[]>(Prisma.sql`
      SELECT
        r."data" ->> ${field} AS value,
        COUNT(*)::text AS count
      FROM "AnalyticsDatasetRow" r
      WHERE r."datasetId" = ${input.datasetId}
        AND r."sheetId" = ${input.sheetId}
        AND r."datasetVersion" = ${input.datasetVersion}
        AND r."data" ? ${field}
        AND r."data" -> ${field} <> 'null'::jsonb
      GROUP BY 1
      ORDER BY COUNT(*) DESC, value ASC
      LIMIT 10
    `);
    topValues = frequencies.map((entry) => ({
      value: entry.value,
      count: Number(entry.count),
    }));
  }
  return {
    ...input.column,
    uniqueCount,
    nullCount,
    nullPercentage: percentage(nullCount, input.rowCount),
    nonNullCount,
    cardinalityRatio: ratio(uniqueCount, nonNullCount),
    minValue: isNumeric
      ? aggregate.numeric_min
      : isDate
        ? aggregate.date_min
        : null,
    maxValue: isNumeric
      ? aggregate.numeric_max
      : isDate
        ? aggregate.date_max
        : null,
    averageValue: isNumeric ? aggregate.numeric_average : null,
    topValues,
  };
}

function warningsFor(
  columns: ProfiledColumn[],
  duplicateRowCount: number,
  rowCount: number,
) {
  const warnings: Array<{
    code: string;
    severity: "info" | "warning";
    column: string | null;
    message: string;
    evidence: Record<string, number | string>;
  }> = [];
  if (duplicateRowCount > 0) {
    warnings.push({
      code: "DUPLICATE_ROWS",
      severity: "warning",
      column: null,
      message: `${duplicateRowCount.toLocaleString("en-IN")} duplicate rows were detected.`,
      evidence: {
        duplicateRowCount,
        duplicatePercentage: percentage(duplicateRowCount, rowCount),
      },
    });
  }
  for (const column of columns) {
    if (column.nullCount === rowCount) {
      warnings.push({
        code: "EMPTY_COLUMN",
        severity: "warning",
        column: column.normalizedName,
        message: `${column.displayName} contains no non-null values.`,
        evidence: { nullPercentage: 100 },
      });
    } else if (column.nullPercentage >= 50) {
      warnings.push({
        code: "HIGH_MISSINGNESS",
        severity: "warning",
        column: column.normalizedName,
        message: `${column.displayName} is ${column.nullPercentage}% null.`,
        evidence: {
          nullCount: column.nullCount,
          nullPercentage: column.nullPercentage,
        },
      });
    }
    if (column.nonNullCount > 1 && column.uniqueCount === 1) {
      warnings.push({
        code: "CONSTANT_COLUMN",
        severity: "info",
        column: column.normalizedName,
        message: `${column.displayName} has one distinct non-null value.`,
        evidence: { uniqueCount: 1, nonNullCount: column.nonNullCount },
      });
    }
    if (
      column.dataType === "STRING" &&
      column.nonNullCount >= 20 &&
      column.cardinalityRatio >= 0.98
    ) {
      warnings.push({
        code: "HIGH_CARDINALITY_TEXT",
        severity: "info",
        column: column.normalizedName,
        message: `${column.displayName} is nearly unique and may be an identifier rather than a chart dimension.`,
        evidence: {
          uniqueCount: column.uniqueCount,
          cardinalityRatio: column.cardinalityRatio,
        },
      });
    }
    if (warnings.length >= 200) break;
  }
  return warnings;
}

async function beginProfile(datasetId: string) {
  await prisma.$transaction(async (transaction) => {
    const sequence = await transaction.analyticsProcessingEvent.aggregate({
      where: { datasetId },
      _max: { sequence: true },
    });
    await transaction.analyticsDataset.update({
      where: { id: datasetId },
      data: {
        status: "PROFILING",
        processingStage: "PROFILING",
        processingMessage: "Calculating dataset statistics",
        processingHeartbeatAt: new Date(),
      },
    });
    await transaction.analyticsProcessingEvent.create({
      data: {
        datasetId,
        sequence: (sequence._max.sequence ?? 0) + 1,
        stage: "PROFILING",
        status: "STARTED",
        message: "Dataset profiling started",
      },
    });
  });
}

export async function profileAnalyticsDataset(
  datasetId: string,
  sheetId: string,
) {
  const dataset = await prisma.analyticsDataset.findFirst({
    where: {
      id: datasetId,
      activeSheetId: sheetId,
      deletedAt: null,
    },
    include: {
      activeSheet: {
        include: {
          columns: {
            orderBy: { ordinal: "asc" },
          },
        },
      },
    },
  });
  if (!dataset?.activeSheet) {
    throw new ApiError(
      404,
      "Active analytics worksheet was not found",
      "ANALYTICS_SHEET_NOT_FOUND",
    );
  }
  if (dataset.rowCount < 1 || dataset.activeSheet.columns.length < 1) {
    throw new ApiError(
      409,
      "Normalized data is required before profiling",
      "ANALYTICS_NORMALIZED_DATA_REQUIRED",
    );
  }
  await beginProfile(datasetId);

  const duplicateResult = await prisma.$queryRaw<DuplicateAggregateRow[]>(
    Prisma.sql`
      SELECT
        COUNT(*)::text AS total_count,
        COUNT(DISTINCT r."data")::text AS distinct_count
      FROM "AnalyticsDatasetRow" r
      WHERE r."datasetId" = ${datasetId}
        AND r."sheetId" = ${sheetId}
        AND r."datasetVersion" = ${dataset.datasetVersion}
    `,
  );
  const totalCount = Number(duplicateResult[0]?.total_count ?? 0);
  const distinctCount = Number(duplicateResult[0]?.distinct_count ?? 0);
  if (totalCount !== dataset.rowCount) {
    throw new ApiError(
      409,
      "Normalized row count changed during profiling",
      "ANALYTICS_PROFILE_VERSION_CONFLICT",
    );
  }
  const profiledColumns = await mapConcurrent(
    dataset.activeSheet.columns,
    6,
    (column) =>
      profileColumn({
        datasetId,
        sheetId,
        datasetVersion: dataset.datasetVersion,
        rowCount: dataset.rowCount,
        column: {
          id: column.id,
          originalName: column.originalName,
          normalizedName: column.normalizedName,
          displayName: column.displayName,
          dataType: column.dataType,
          nullable: column.nullable,
          sampleValues: column.sampleValues,
        },
      }),
  );
  const duplicateRowCount = Math.max(0, totalCount - distinctCount);
  const warnings = warningsFor(
    profiledColumns,
    duplicateRowCount,
    dataset.rowCount,
  );
  const dateRanges = Object.fromEntries(
    profiledColumns
      .filter(
        (column) =>
          (column.dataType === "DATE" || column.dataType === "DATETIME") &&
          column.minValue &&
          column.maxValue,
      )
      .map((column) => [
        column.normalizedName,
        { min: column.minValue, max: column.maxValue },
      ]),
  );
  const completeness =
    dataset.rowCount * profiledColumns.length === 0
      ? 100
      : Math.round(
          (1 -
            profiledColumns.reduce(
              (sum, column) => sum + column.nullCount,
              0,
            ) /
              (dataset.rowCount * profiledColumns.length)) *
            100 *
            10_000,
        ) / 10_000;
  const compactColumns = profiledColumns.map((column) => ({
    field: column.normalizedName,
    label: column.displayName,
    dataType: column.dataType,
    nullable: column.nullable,
    nullCount: column.nullCount,
    nullPercentage: column.nullPercentage,
    uniqueCount: column.uniqueCount,
    cardinalityRatio: column.cardinalityRatio,
    minValue: column.minValue,
    maxValue: column.maxValue,
    averageValue: column.averageValue,
    sampleValues: column.sampleValues,
    topValues: column.topValues,
  }));
  const profile = {
    schemaVersion: 1,
    datasetVersion: dataset.datasetVersion,
    sheetId,
    rowCount: dataset.rowCount,
    columnCount: profiledColumns.length,
    duplicateRowCount,
    completenessPercentage: completeness,
    typeSummary: {
      numeric: profiledColumns.filter((column) =>
        ["INTEGER", "DECIMAL"].includes(column.dataType),
      ).length,
      date: profiledColumns.filter((column) =>
        ["DATE", "DATETIME"].includes(column.dataType),
      ).length,
      boolean: profiledColumns.filter(
        (column) => column.dataType === "BOOLEAN",
      ).length,
      text: profiledColumns.filter(
        (column) => column.dataType === "STRING",
      ).length,
      unknown: profiledColumns.filter(
        (column) => column.dataType === "UNKNOWN",
      ).length,
    },
    columns: compactColumns,
  };

  await prisma.$transaction(
    async (transaction) => {
      for (const column of profiledColumns) {
        await transaction.analyticsDatasetColumn.update({
          where: { id: column.id },
          data: {
            uniqueCount: column.uniqueCount,
            nullCount: column.nullCount,
            nullPercentage: column.nullPercentage,
            minValue: column.minValue,
            maxValue: column.maxValue,
            averageValue: column.averageValue,
            statistics: {
              nonNullCount: column.nonNullCount,
              cardinalityRatio: column.cardinalityRatio,
              topValues: column.topValues,
            },
          },
        });
      }
      await transaction.analyticsDatasetProfile.upsert({
        where: {
          datasetId_datasetVersion_sheetId: {
            datasetId,
            datasetVersion: dataset.datasetVersion,
            sheetId,
          },
        },
        create: {
          datasetId,
          sheetId,
          datasetVersion: dataset.datasetVersion,
          rowCount: dataset.rowCount,
          columnCount: profiledColumns.length,
          duplicateRowCount,
          profile,
          sampleRows: dataset.activeSheet?.sampleRows ?? [],
          dataQualityWarnings: warnings,
          detectedDateRanges: dateRanges,
          detectedRelationships: [],
        },
        update: {
          rowCount: dataset.rowCount,
          columnCount: profiledColumns.length,
          duplicateRowCount,
          profile,
          sampleRows: dataset.activeSheet?.sampleRows ?? [],
          dataQualityWarnings: warnings,
          detectedDateRanges: dateRanges,
          detectedRelationships: [],
          createdAt: new Date(),
        },
      });
      await transaction.analyticsDatasetSheet.update({
        where: { id: sheetId },
        data: { status: "PROFILED" },
      });
      await transaction.analyticsDataset.update({
        where: { id: datasetId },
        data: {
          status: "ANALYZING",
          processingStage: "UNDERSTANDING",
          processingMessage:
            "Dataset profile ready; awaiting semantic analysis",
          processingHeartbeatAt: new Date(),
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
          stage: "PROFILING",
          status: "COMPLETED",
          message: `Profiled ${dataset.rowCount.toLocaleString("en-IN")} rows and ${profiledColumns.length} columns`,
          details: {
            rowCount: dataset.rowCount,
            columnCount: profiledColumns.length,
            duplicateRowCount,
            warningCount: warnings.length,
            completenessPercentage: completeness,
          },
        },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId: dataset.ownerAdminId,
          action: "ANALYTICS_DATASET_PROFILED",
          resourceType: "AnalyticsDatasetProfile",
          metadata: {
            datasetId,
            sheetId,
            datasetVersion: dataset.datasetVersion,
            rowCount: dataset.rowCount,
            columnCount: profiledColumns.length,
            duplicateRowCount,
            warningCount: warnings.length,
          },
        },
      });
    },
    { timeout: 120_000, maxWait: 10_000 },
  );

  return {
    datasetId,
    sheetId,
    datasetVersion: dataset.datasetVersion,
    profile,
    warnings,
    dateRanges,
  };
}
