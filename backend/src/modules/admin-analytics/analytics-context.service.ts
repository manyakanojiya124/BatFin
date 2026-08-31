import { createHash } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { ApiError } from "../../middleware/error.middleware.js";

const MAX_CONTEXT_BYTES = 200_000;
const sensitiveFieldPattern =
  /(^|_)(customer_name|pan|pan_number|aadhaar|aadhar|voter|driv(?:er|ering)_?license|mobile|mobile_no|phone|email|date_of_birth|dob|gender|caste|marital_status|education_qualification|occupation_type|is_deceased|cibil_score|cibil_group|father_name|mother_name|spouse_name|sourcing_rm_name|last_receipt_maker|permanent_address|current_address|address|pincode|postal_code|global_cust_id|customer_id|loan_id|loan_account_number|source_application_number|engine_no|chassis_no|chasis_no|registration|alternate_number)(_|$)/i;

function sensitiveField(field: unknown) {
  return typeof field === "string" && sensitiveFieldPattern.test(field);
}

function boundedValue(value: unknown, maximum = 160): unknown {
  if (value === null || value === undefined) return null;
  if (
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "string") {
    return value.length > maximum ? `${value.slice(0, maximum)}…` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map((item) => boundedValue(item, maximum));
  }
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .slice(0, 100)
        .map(([key, item]) => [key, boundedValue(item, maximum)]),
    );
  }
  return String(value).slice(0, maximum);
}

function profileObject(value: Prisma.JsonValue) {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    throw new ApiError(
      500,
      "Persisted analytics profile is invalid",
      "ANALYTICS_PROFILE_INVALID",
    );
  }
  return value as Record<string, Prisma.JsonValue>;
}

function profileColumns(value: Prisma.JsonValue | undefined) {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 500)
    .filter(
      (column): column is Record<string, Prisma.JsonValue> =>
        Boolean(column) && !Array.isArray(column) && typeof column === "object",
    );
}

function buildContext(input: {
  dataset: {
    id: string;
    name: string;
    description: string | null;
    datasetVersion: number;
    rowCount: number;
    columnCount: number;
  };
  sheet: {
    id: string;
    name: string;
    detectedHeaderRow: number | null;
    dataStartRow: number | null;
  };
  profile: {
    profile: Prisma.JsonValue;
    sampleRows: Prisma.JsonValue;
    dataQualityWarnings: Prisma.JsonValue;
    detectedDateRanges: Prisma.JsonValue | null;
    detectedRelationships: Prisma.JsonValue | null;
    duplicateRowCount: number;
    createdAt: Date;
  };
  sampleRowLimit: number;
  sampleValueLimit: number;
}) {
  const profile = profileObject(input.profile.profile);
  const sourceColumns = profileColumns(profile.columns);
  const excludedSampleFields = sourceColumns
    .map((column) => column.field)
    .filter((field): field is string => sensitiveField(field));
  const excluded = new Set(excludedSampleFields);
  const columns = sourceColumns.map((column) => {
    const field = typeof column.field === "string" ? column.field : "";
    const sensitive = excluded.has(field);
    return {
      field: boundedValue(column.field),
      label: boundedValue(column.label),
      dataType: boundedValue(column.dataType),
      nullable: boundedValue(column.nullable),
      nullCount: boundedValue(column.nullCount),
      nullPercentage: boundedValue(column.nullPercentage),
      uniqueCount: boundedValue(column.uniqueCount),
      cardinalityRatio: boundedValue(column.cardinalityRatio),
      sensitiveSamplesExcluded: sensitive,
      minValue: sensitive ? null : boundedValue(column.minValue),
      maxValue: sensitive ? null : boundedValue(column.maxValue),
      averageValue: sensitive ? null : boundedValue(column.averageValue),
      sampleValues:
        !sensitive && Array.isArray(column.sampleValues)
          ? column.sampleValues
              .slice(0, input.sampleValueLimit)
              .map((value) => boundedValue(value, 120))
          : [],
      topValues:
        !sensitive && Array.isArray(column.topValues)
          ? column.topValues
              .slice(0, 5)
              .map((value) => boundedValue(value, 120))
          : [],
    };
  });
  const sampleRows = Array.isArray(input.profile.sampleRows)
    ? input.profile.sampleRows.slice(0, input.sampleRowLimit).map((row) => {
        if (!row || Array.isArray(row) || typeof row !== "object") {
          return boundedValue(row, 120);
        }
        return Object.fromEntries(
          Object.entries(row).map(([field, value]) => [
            field,
            excluded.has(field) ? "[REDACTED]" : boundedValue(value, 120),
          ]),
        );
      })
    : [];
  const warnings = Array.isArray(input.profile.dataQualityWarnings)
    ? input.profile.dataQualityWarnings
        .slice(0, 50)
        .map((warning) => boundedValue(warning, 240))
    : [];
  const dateRanges =
    input.profile.detectedDateRanges &&
    !Array.isArray(input.profile.detectedDateRanges) &&
    typeof input.profile.detectedDateRanges === "object"
      ? Object.fromEntries(
          Object.entries(input.profile.detectedDateRanges).filter(
            ([field]) => !excluded.has(field),
          ),
        )
      : {};
  return {
    contextSchemaVersion: 2,
    dataset: {
      id: input.dataset.id,
      name: input.dataset.name,
      description: input.dataset.description,
      datasetVersion: input.dataset.datasetVersion,
      rowCount: input.dataset.rowCount,
      columnCount: input.dataset.columnCount,
      duplicateRowCount: input.profile.duplicateRowCount,
      completenessPercentage: profile.completenessPercentage ?? null,
      typeSummary: profile.typeSummary ?? {},
      profileCreatedAt: input.profile.createdAt.toISOString(),
    },
    sheet: {
      id: input.sheet.id,
      name: input.sheet.name,
      detectedHeaderRow: input.sheet.detectedHeaderRow,
      dataStartRow: input.sheet.dataStartRow,
    },
    columns,
    sampleRows,
    privacy: {
      sensitiveSampleValuesExcluded: true,
      excludedSampleFields,
    },
    dateRanges: boundedValue(dateRanges),
    relationships: boundedValue(input.profile.detectedRelationships ?? []),
    dataQualityWarnings: warnings,
  };
}

export function createAnalyticsContext(input: {
  dataset: {
    id: string;
    name: string;
    description: string | null;
    datasetVersion: number;
    rowCount: number;
    columnCount: number;
  };
  sheet: {
    id: string;
    name: string;
    detectedHeaderRow: number | null;
    dataStartRow: number | null;
  };
  profile: {
    profile: Prisma.JsonValue;
    sampleRows: Prisma.JsonValue;
    dataQualityWarnings: Prisma.JsonValue;
    detectedDateRanges: Prisma.JsonValue | null;
    detectedRelationships: Prisma.JsonValue | null;
    duplicateRowCount: number;
    createdAt: Date;
  };
}) {
  let context = buildContext({
    ...input,
    sampleRowLimit: 3,
    sampleValueLimit: 5,
  });
  let serialized = JSON.stringify(context);
  if (Buffer.byteLength(serialized, "utf8") > MAX_CONTEXT_BYTES) {
    context = buildContext({
      ...input,
      sampleRowLimit: 1,
      sampleValueLimit: 2,
    });
    serialized = JSON.stringify(context);
  }
  const sizeBytes = Buffer.byteLength(serialized, "utf8");
  if (sizeBytes > MAX_CONTEXT_BYTES) {
    throw new ApiError(
      413,
      "Compact analytics context exceeds the configured safety limit",
      "ANALYTICS_CONTEXT_TOO_LARGE",
    );
  }
  return {
    context,
    sizeBytes,
    sha256: createHash("sha256").update(serialized).digest("hex"),
  };
}
