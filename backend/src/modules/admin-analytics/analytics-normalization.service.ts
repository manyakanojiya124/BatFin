import { env } from "../../config/env.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type {
  AnalyticsCell,
  AnalyticsMatrix,
  HeaderDetectionResult,
} from "./analytics-header-detection.service.js";

export type AnalyticsPhysicalType =
  | "STRING"
  | "INTEGER"
  | "DECIMAL"
  | "BOOLEAN"
  | "DATE"
  | "DATETIME"
  | "UNKNOWN";

type NormalizedValue = string | number | boolean | null;

interface NormalizedCell {
  value: NormalizedValue;
  type: AnalyticsPhysicalType | "NULL";
}

export interface NormalizedAnalyticsColumn {
  ordinal: number;
  originalName: string;
  normalizedName: string;
  displayName: string;
  dataType: AnalyticsPhysicalType;
  nullable: boolean;
  sampleValues: Array<string | number | boolean>;
}

export interface NormalizedAnalyticsRow {
  rowNumber: number;
  data: Record<string, NormalizedValue>;
}

export interface NormalizedAnalyticsSheet {
  columns: NormalizedAnalyticsColumn[];
  rows: NormalizedAnalyticsRow[];
  sampleRows: Array<Record<string, NormalizedValue>>;
  rowCount: number;
  columnCount: number;
  excludedSummaryRowCount: number;
}

const nullTokens = new Set(["", "-", "--", "—", "null", "n/a", "na", "none", "undefined"]);
const trueTokens = new Set(["true", "yes", "y"]);
const falseTokens = new Set(["false", "no", "n"]);

function blank(value: AnalyticsCell | undefined) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function headerText(value: AnalyticsCell | undefined, ordinal: number) {
  if (value instanceof Date) return value.toISOString();
  const normalized =
    value === null || value === undefined
      ? ""
      : String(value).trim().replace(/\s+/g, " ");
  return normalized || `Column ${ordinal + 1}`;
}

function uniqueColumnName(
  displayName: string,
  ordinal: number,
  used: Set<string>,
) {
  let base = displayName
    .normalize("NFKC")
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 220);
  if (!base) base = `column_${ordinal + 1}`;
  if (/^\d/.test(base)) base = `column_${base}`;
  let candidate = base;
  let suffix = 2;
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 235)}_${suffix}`;
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return date.toISOString().slice(0, 10);
}

function parseDateString(value: string): NormalizedCell | null {
  const namedMonth = value.match(/^(\d{1,2})[-/ ]([A-Za-z]{3,9})[-/ ](\d{2}|\d{4})$/);
  if (namedMonth) {
    const months = new Map([
      ["jan", 1], ["january", 1], ["feb", 2], ["february", 2], ["mar", 3], ["march", 3],
      ["apr", 4], ["april", 4], ["may", 5], ["jun", 6], ["june", 6], ["jul", 7], ["july", 7],
      ["aug", 8], ["august", 8], ["sep", 9], ["sept", 9], ["september", 9], ["oct", 10],
      ["october", 10], ["nov", 11], ["november", 11], ["dec", 12], ["december", 12],
    ]);
    const month = months.get(namedMonth[2]!.toLowerCase());
    const yearValue = Number(namedMonth[3]);
    const year = namedMonth[3]!.length === 2 ? (yearValue <= 69 ? 2000 + yearValue : 1900 + yearValue) : yearValue;
    const dateOnly = month ? isoDate(year, month, Number(namedMonth[1])) : null;
    if (dateOnly) return { value: dateOnly, type: "DATE" };
  }
  const iso = value.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
  );
  if (iso) {
    const dateOnly = isoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    if (!dateOnly) return null;
    if (!iso[4]) return { value: dateOnly, type: "DATE" };
    const parsed = new Date(value.replace(" ", "T"));
    if (Number.isNaN(parsed.getTime())) return null;
    return { value: parsed.toISOString(), type: "DATETIME" };
  }
  const dayFirst = value.match(
    /^(\d{1,2})-(\d{1,2})-(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (dayFirst) {
    const dateOnly = isoDate(
      Number(dayFirst[3]),
      Number(dayFirst[2]),
      Number(dayFirst[1]),
    );
    if (!dateOnly) return null;
    if (!dayFirst[4]) return { value: dateOnly, type: "DATE" };
    const hour = Number(dayFirst[4]);
    const minute = Number(dayFirst[5]);
    const second = Number(dayFirst[6] ?? 0);
    if (hour > 23 || minute > 59 || second > 59) return null;
    return {
      value: new Date(
        `${dateOnly}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}.000Z`,
      ).toISOString(),
      type: "DATETIME",
    };
  }
  return null;
}

function parseNumericString(value: string): NormalizedCell | null {
  const negative = /^\(.+\)$/.test(value);
  const unwrapped = negative ? value.slice(1, -1) : value;
  const normalized = unwrapped
    .replace(/^[₹$€£¥]\s*/, "")
    .replace(/%$/, "")
    .replace(/,/g, "")
    .trim();
  if (!/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(normalized)) {
    return null;
  }
  const unsigned = normalized.replace(/^[-+]/, "");
  if (/^0\d+/.test(unsigned) && !unsigned.includes(".")) return null;
  if (!unsigned.includes(".") && !/[eE]/.test(unsigned) && unsigned.length > 15) {
    return null;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  const result = negative ? -Math.abs(parsed) : parsed;
  return {
    value: result,
    type: Number.isInteger(result) ? "INTEGER" : "DECIMAL",
  };
}

function normalizeCell(value: AnalyticsCell | undefined): NormalizedCell {
  if (value === null || value === undefined) return { value: null, type: "NULL" };
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { value: null, type: "NULL" };
    const hasTime =
      value.getUTCHours() !== 0 ||
      value.getUTCMinutes() !== 0 ||
      value.getUTCSeconds() !== 0 ||
      value.getUTCMilliseconds() !== 0;
    return {
      value: hasTime ? value.toISOString() : value.toISOString().slice(0, 10),
      type: hasTime ? "DATETIME" : "DATE",
    };
  }
  if (typeof value === "boolean") return { value, type: "BOOLEAN" };
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return { value: null, type: "NULL" };
    return { value, type: Number.isInteger(value) ? "INTEGER" : "DECIMAL" };
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length > 20_000) {
    throw new ApiError(
      413,
      "A dataset cell exceeds the 20,000-character limit",
      "ANALYTICS_CELL_LIMIT_EXCEEDED",
    );
  }
  const lower = normalized.toLowerCase();
  if (nullTokens.has(lower)) return { value: null, type: "NULL" };
  if (trueTokens.has(lower)) return { value: true, type: "BOOLEAN" };
  if (falseTokens.has(lower)) return { value: false, type: "BOOLEAN" };
  const date = parseDateString(normalized);
  if (date) return date;
  const numeric = parseNumericString(normalized);
  if (numeric) return numeric;
  return { value: normalized, type: "STRING" };
}

function summaryRow(cells: NormalizedCell[]) {
  const firstNonNullIndex = cells.findIndex((cell) => cell.value !== null);
  if (firstNonNullIndex < 0 || firstNonNullIndex > 2) return false;
  const marker = cells[firstNonNullIndex]?.value;
  if (typeof marker !== "string" || !/^(grand\s+total|sub\s*total|total|overall|summary)$/i.test(marker.trim())) return false;
  const nonNull = cells.filter((cell) => cell.value !== null);
  const numeric = nonNull.filter((cell) => typeof cell.value === "number").length;
  const text = nonNull.filter((cell) => typeof cell.value === "string").length;
  return numeric > 0 && text <= 2 && nonNull.length <= Math.ceil(cells.length * 0.6);
}

function inferredType(types: Set<AnalyticsPhysicalType>) {
  if (!types.size) return "UNKNOWN" as const;
  if (types.size === 1) return [...types][0]!;
  if (
    [...types].every((type) => type === "INTEGER" || type === "DECIMAL")
  ) {
    return "DECIMAL" as const;
  }
  if ([...types].every((type) => type === "DATE" || type === "DATETIME")) {
    return "DATETIME" as const;
  }
  return "STRING" as const;
}

export function normalizeAnalyticsSheet(
  matrix: AnalyticsMatrix,
  header: HeaderDetectionResult,
): NormalizedAnalyticsSheet {
  if (header.columnCount > env.analyticsMaxColumns) {
    throw new ApiError(
      413,
      `Sheet exceeds the configured ${env.analyticsMaxColumns}-column limit`,
      "ANALYTICS_COLUMN_LIMIT_EXCEEDED",
    );
  }
  const headerRow = matrix[header.headerRowIndex] ?? [];
  const used = new Set<string>();
  const definitions = Array.from({ length: header.columnCount }, (_, ordinal) => {
    const originalName = headerText(headerRow[ordinal], ordinal);
    return {
      ordinal,
      originalName,
      normalizedName: uniqueColumnName(originalName, ordinal, used),
      displayName: originalName,
    };
  });
  const typeSets = definitions.map(() => new Set<AnalyticsPhysicalType>());
  const hasNull = definitions.map(() => false);
  const samples = definitions.map(() => new Map<string, string | number | boolean>());
  const rows: NormalizedAnalyticsRow[] = [];
  let excludedSummaryRowCount = 0;

  for (let matrixIndex = header.dataStartRowIndex; matrixIndex < matrix.length; matrixIndex += 1) {
    const sourceRow = matrix[matrixIndex] ?? [];
    if (sourceRow.every(blank)) continue;
    const normalizedCells = definitions.map((column) => normalizeCell(sourceRow[column.ordinal]));
    if (summaryRow(normalizedCells)) {
      excludedSummaryRowCount += 1;
      continue;
    }
    const data: Record<string, NormalizedValue> = {};
    for (const column of definitions) {
      const cell = normalizedCells[column.ordinal]!;
      data[column.normalizedName] = cell.value;
      if (cell.type === "NULL") {
        hasNull[column.ordinal] = true;
      } else {
        typeSets[column.ordinal]!.add(cell.type);
        if (samples[column.ordinal]!.size < 10) {
          samples[column.ordinal]!.set(
            `${typeof cell.value}:${String(cell.value)}`,
            cell.value as string | number | boolean,
          );
        }
      }
    }
    rows.push({ rowNumber: matrixIndex + 1, data });
    if (rows.length > env.analyticsMaxRows) {
      throw new ApiError(
        413,
        `Sheet exceeds the configured ${env.analyticsMaxRows.toLocaleString("en-IN")}-row limit`,
        "ANALYTICS_ROW_LIMIT_EXCEEDED",
      );
    }
  }
  if (!rows.length) {
    throw new ApiError(
      400,
      "Selected sheet has no data rows below the detected header",
      "ANALYTICS_SHEET_EMPTY",
    );
  }
  const columns: NormalizedAnalyticsColumn[] = definitions.map((column) => ({
    ...column,
    dataType: inferredType(typeSets[column.ordinal]!),
    nullable: hasNull[column.ordinal]!,
    sampleValues: [...samples[column.ordinal]!.values()],
  }));
  return {
    columns,
    rows,
    sampleRows: rows.slice(0, 5).map((row) => row.data),
    rowCount: rows.length,
    columnCount: columns.length,
    excludedSummaryRowCount,
  };
}
