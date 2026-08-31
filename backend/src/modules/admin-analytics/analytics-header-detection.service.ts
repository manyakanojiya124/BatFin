export type AnalyticsCell = string | number | boolean | Date | null;
export type AnalyticsMatrix = AnalyticsCell[][];

export interface HeaderDetectionResult {
  headerRowIndex: number;
  dataStartRowIndex: number;
  columnCount: number;
  confidence: number;
  reason: string;
}

function blank(value: AnalyticsCell | undefined) {
  return (
    value === null ||
    value === undefined ||
    (typeof value === "string" && value.trim() === "")
  );
}

function cellText(value: AnalyticsCell | undefined) {
  if (value instanceof Date) return value.toISOString();
  return value === null || value === undefined ? "" : String(value).trim();
}

function looksNumeric(value: string) {
  const normalized = value
    .replace(/[₹$€£¥,%\s]/g, "")
    .replace(/,/g, "")
    .replace(/^\((.+)\)$/, "-$1");
  return normalized !== "" && /^[-+]?\d+(?:\.\d+)?$/.test(normalized);
}

function looksDate(value: string) {
  return (
    /^\d{4}[-/]\d{1,2}[-/]\d{1,2}(?:[ T].*)?$/.test(value) ||
    /^\d{1,2}[-/]\d{1,2}[-/]\d{4}(?:[ T].*)?$/.test(value)
  );
}

function nonEmptyCount(row: AnalyticsCell[]) {
  return row.reduce<number>(
    (count, value) => count + (blank(value) ? 0 : 1),
    0,
  );
}

function usedWidth(rows: AnalyticsMatrix) {
  let last = -1;
  for (const row of rows) {
    for (let index = row.length - 1; index >= 0; index -= 1) {
      if (!blank(row[index])) {
        last = Math.max(last, index);
        break;
      }
    }
  }
  return last + 1;
}

export function detectHeaderRow(
  matrix: AnalyticsMatrix,
  scanRows = 50,
): HeaderDetectionResult | null {
  if (!matrix.length) return null;
  const limit = Math.min(matrix.length, scanRows);
  let best:
    | {
        index: number;
        score: number;
        width: number;
        followingRows: number;
      }
    | undefined;

  for (let index = 0; index < limit; index += 1) {
    const row = matrix[index] ?? [];
    const populated = row
      .map((value, column) => ({ value, column }))
      .filter(({ value }) => !blank(value));
    if (populated.length < 2) continue;

    const texts = populated.map(({ value }) => cellText(value));
    const uniqueRatio = new Set(texts.map((value) => value.toLowerCase())).size / texts.length;
    const textRatio =
      texts.filter((value) => !looksNumeric(value) && !looksDate(value)).length /
      texts.length;
    const conciseRatio =
      texts.filter((value) => value.length > 0 && value.length <= 120).length /
      texts.length;
    const nextRows = matrix
      .slice(index + 1, Math.min(matrix.length, index + 11))
      .filter((candidate) => nonEmptyCount(candidate) >= 2);
    if (!nextRows.length) continue;

    const headerWidth = Math.max(
      populated.at(-1)?.column ?? 0,
      usedWidth(nextRows.slice(0, 5)) - 1,
    ) + 1;
    const averageCoverage =
      nextRows.reduce<number>(
        (total, candidate) =>
          total + Math.min(1, nonEmptyCount(candidate) / populated.length),
        0,
      ) / nextRows.length;
    const similarWidthRatio =
      nextRows.filter((candidate) => {
        const count = nonEmptyCount(candidate);
        return count >= populated.length * 0.5 && count <= headerWidth * 1.25;
      }).length / nextRows.length;
    const widthScore = Math.min(1, populated.length / 8);
    const earlyRowScore = 1 - index / Math.max(1, limit);
    const score =
      uniqueRatio * 0.2 +
      textRatio * 0.22 +
      conciseRatio * 0.08 +
      averageCoverage * 0.24 +
      similarWidthRatio * 0.16 +
      widthScore * 0.06 +
      earlyRowScore * 0.04;

    if (!best || score > best.score) {
      best = { index, score, width: headerWidth, followingRows: nextRows.length };
    }
  }

  if (!best || best.score < 0.48) return null;
  const nextDataIndex = matrix.findIndex(
    (row, index) => index > best!.index && nonEmptyCount(row) > 0,
  );
  if (nextDataIndex < 0) return null;
  const confidence = Math.max(0, Math.min(1, best.score));
  return {
    headerRowIndex: best.index,
    dataStartRowIndex: nextDataIndex,
    columnCount: best.width,
    confidence,
    reason: `Row ${best.index + 1} has ${nonEmptyCount(
      matrix[best.index] ?? [],
    )} distinct header candidates and consistent values across ${best.followingRows} following rows.`,
  };
}

export function scorePrimarySheet(input: {
  name: string;
  hidden: boolean;
  sourceRowCount: number;
  formulaCount: number;
  header: HeaderDetectionResult | null;
}) {
  if (!input.header || input.sourceRowCount < 2) {
    return {
      score: 0,
      reason: "No reliable tabular header and data region was detected.",
    };
  }
  const normalizedName = input.name.trim().toLowerCase();
  const dataNameBoost = /(data|master|raw|detail|record|transaction|case)/.test(
    normalizedName,
  )
    ? 0.12
    : 0;
  const derivedNamePenalty =
    /(dashboard|summary|pivot|chart|graph|map|overview|^by\b)/.test(
      normalizedName,
    )
      ? 0.2
      : 0;
  const rowScore = Math.min(1, Math.log10(input.sourceRowCount + 1) / 4);
  const formulaPenalty = Math.min(
    0.18,
    input.formulaCount / Math.max(1, input.sourceRowCount) / 5,
  );
  const hiddenPenalty = input.hidden ? 0.2 : 0;
  const score = Math.max(
    0,
    Math.min(
      1,
      input.header.confidence * 0.58 +
        rowScore * 0.3 +
        dataNameBoost -
        derivedNamePenalty -
        formulaPenalty -
        hiddenPenalty,
    ),
  );
  const reasons = [
    `${input.sourceRowCount.toLocaleString("en-IN")} source rows`,
    `${input.header.columnCount} detected columns`,
    `header confidence ${Math.round(input.header.confidence * 100)}%`,
  ];
  if (dataNameBoost) reasons.push("name suggests a raw/detail data sheet");
  if (derivedNamePenalty) reasons.push("name suggests a derived presentation sheet");
  if (input.hidden) reasons.push("sheet is hidden");
  return { score, reason: reasons.join("; ") };
}
