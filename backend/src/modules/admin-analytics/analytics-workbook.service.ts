import { TextDecoder } from "node:util";

import { parse } from "csv-parse/sync";
import * as XLSX from "@e965/xlsx";

import { env } from "../../config/env.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type {
  AnalyticsCell,
  AnalyticsMatrix,
} from "./analytics-header-detection.service.js";

export type AnalyticsSourceFileType = "CSV" | "XLSX" | "XLS";

export interface ParsedAnalyticsSheet {
  name: string;
  sheetIndex: number;
  hidden: boolean;
  sourceRowCount: number;
  sourceColumnCount: number;
  declaredRowCount: number | null;
  declaredColumnCount: number | null;
  mergedCellCount: number;
  formulaCount: number;
  matrix: AnalyticsMatrix;
}

export interface ParsedAnalyticsWorkbook {
  fileType: AnalyticsSourceFileType;
  sheets: ParsedAnalyticsSheet[];
}

function blank(value: AnalyticsCell | undefined) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function safeCell(value: unknown): AnalyticsCell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  return String(value).slice(0, 20_000);
}

function compactMatrix(source: unknown[][]): AnalyticsMatrix {
  const matrix: AnalyticsMatrix = source.map((sourceRow) => {
    const row = sourceRow.map(safeCell);
    while (row.length && blank(row.at(-1))) row.pop();
    return row;
  });
  while (matrix.length && (matrix.at(-1)?.every(blank) ?? true)) matrix.pop();
  return matrix;
}

function matrixWidth(matrix: AnalyticsMatrix) {
  return matrix.reduce((width, row) => Math.max(width, row.length), 0);
}

function countFormulas(sheet: XLSX.WorkSheet) {
  const denseData = (sheet as XLSX.WorkSheet & {
    "!data"?: Array<Array<{ f?: string } | undefined>>;
  })["!data"];
  if (Array.isArray(denseData)) {
    return denseData.reduce(
      (count, row) =>
        count +
        (row?.reduce(
          (rowCount, cell) => rowCount + (cell?.f ? 1 : 0),
          0,
        ) ?? 0),
      0,
    );
  }
  return Object.entries(sheet).reduce(
    (count, [address, cell]) =>
      address.startsWith("!")
        ? count
        : count +
          (cell && typeof cell === "object" && "f" in cell && cell.f ? 1 : 0),
    0,
  );
}

function declaredDimensions(sheet: XLSX.WorkSheet) {
  const reference =
    (sheet as XLSX.WorkSheet & { "!fullref"?: string })["!fullref"] ??
    sheet["!ref"];
  if (!reference) return { rows: null, columns: null };
  try {
    const range = XLSX.utils.decode_range(reference);
    return {
      rows: Math.max(0, range.e.r - range.s.r + 1),
      columns: Math.max(0, range.e.c - range.s.c + 1),
    };
  } catch {
    return { rows: null, columns: null };
  }
}

function parseCsv(buffer: Buffer): ParsedAnalyticsWorkbook {
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new ApiError(415, "CSV must be UTF-8 encoded", "INVALID_ANALYTICS_FILE");
  }
  let source: string[][];
  try {
    source = parse(text, {
      bom: true,
      skip_empty_lines: false,
      relax_column_count: true,
      max_record_size: 2_000_000,
    }) as string[][];
  } catch {
    throw new ApiError(
      400,
      "CSV parsing failed. Check quoting and delimiter consistency.",
      "ANALYTICS_CSV_PARSE_FAILED",
    );
  }
  const matrix = compactMatrix(source);
  return {
    fileType: "CSV",
    sheets: [
      {
        name: "CSV Data",
        sheetIndex: 0,
        hidden: false,
        sourceRowCount: matrix.length,
        sourceColumnCount: matrixWidth(matrix),
        declaredRowCount: matrix.length,
        declaredColumnCount: matrixWidth(matrix),
        mergedCellCount: 0,
        formulaCount: 0,
        matrix,
      },
    ],
  };
}

function parseExcel(
  buffer: Buffer,
  fileType: "XLSX" | "XLS",
): ParsedAnalyticsWorkbook {
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      dense: true,
      cellDates: true,
      cellFormula: true,
      cellStyles: false,
      cellNF: false,
      bookVBA: false,
      bookFiles: false,
      sheetRows: env.analyticsMaxRows + env.analyticsHeaderScanRows,
    });
  } catch {
    throw new ApiError(
      400,
      `${fileType} workbook could not be parsed or is encrypted`,
      "ANALYTICS_WORKBOOK_PARSE_FAILED",
    );
  }
  if (!workbook.SheetNames.length) {
    throw new ApiError(
      400,
      "Workbook has no worksheets",
      "ANALYTICS_WORKBOOK_EMPTY",
    );
  }
  if (workbook.SheetNames.length > env.analyticsMaxSheets) {
    throw new ApiError(
      413,
      `Workbook exceeds the configured ${env.analyticsMaxSheets}-sheet limit`,
      "ANALYTICS_SHEET_LIMIT_EXCEEDED",
    );
  }
  const sheets = workbook.SheetNames.map((name, sheetIndex) => {
    const sheet = workbook.Sheets[name];
    if (!sheet) {
      throw new ApiError(
        400,
        `Worksheet ${sheetIndex + 1} is unavailable`,
        "ANALYTICS_WORKBOOK_PARSE_FAILED",
      );
    }
    const source = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: true,
    });
    const matrix = compactMatrix(source);
    const dimensions = declaredDimensions(sheet);
    const sheetProperties = workbook.Workbook?.Sheets?.[sheetIndex];
    return {
      name: name.slice(0, 255),
      sheetIndex,
      hidden: Boolean(sheetProperties?.Hidden),
      sourceRowCount: matrix.length,
      sourceColumnCount: matrixWidth(matrix),
      declaredRowCount: dimensions.rows,
      declaredColumnCount: dimensions.columns,
      mergedCellCount: sheet["!merges"]?.length ?? 0,
      formulaCount: countFormulas(sheet),
      matrix,
    };
  });
  return { fileType, sheets };
}

export function readAnalyticsWorkbook(
  buffer: Buffer,
  fileType: string,
): ParsedAnalyticsWorkbook {
  if (fileType === "CSV") return parseCsv(buffer);
  if (fileType === "XLSX" || fileType === "XLS") {
    return parseExcel(buffer, fileType);
  }
  throw new ApiError(
    415,
    "Unsupported analytics source file type",
    "UNSUPPORTED_ANALYTICS_FILE_TYPE",
  );
}
