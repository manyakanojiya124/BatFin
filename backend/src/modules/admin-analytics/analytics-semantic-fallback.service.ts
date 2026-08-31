import {
  detectAnalyticsDomain,
  matchesAny,
  patternRank,
} from "./analytics-domain-registry.js";
import type { AnalyticsSemanticModel } from "./analytics-semantic.schemas.js";

interface ContextColumn {
  field: string;
  label: string;
  dataType: string;
  uniqueCount: number;
  nullPercentage: number;
  cardinalityRatio: number;
  sensitiveSamplesExcluded: boolean;
  sampleValues: unknown[];
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}
function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}
function contextColumns(context: unknown): ContextColumn[] {
  if (!context || typeof context !== "object" || !("columns" in context)) return [];
  const columns = (context as { columns?: unknown }).columns;
  if (!Array.isArray(columns)) return [];
  return columns
    .map((column) => {
      if (!column || typeof column !== "object") return null;
      const value = column as Record<string, unknown>;
      const field = text(value.field);
      if (!field) return null;
      return {
        field,
        label: text(value.label, field),
        dataType: text(value.dataType, "UNKNOWN"),
        uniqueCount: numberValue(value.uniqueCount),
        nullPercentage: numberValue(value.nullPercentage),
        cardinalityRatio: numberValue(value.cardinalityRatio),
        sensitiveSamplesExcluded: value.sensitiveSamplesExcluded === true,
        sampleValues: Array.isArray(value.sampleValues) ? value.sampleValues : [],
      };
    })
    .filter((column): column is ContextColumn => column !== null);
}
function datasetInfo(context: unknown) {
  const dataset = context && typeof context === "object" && "dataset" in context
    ? (context as { dataset?: unknown }).dataset
    : null;
  const value = dataset && typeof dataset === "object" ? dataset as Record<string, unknown> : {};
  return {
    name: text(value.name, "Analytics Dataset"),
    rowCount: numberValue(value.rowCount),
    columnCount: numberValue(value.columnCount),
    completeness: numberValue(value.completenessPercentage),
    duplicateRowCount: numberValue(value.duplicateRowCount),
  };
}
function identifierLike(field: string) {
  return /(^|_)(id|identifier|serial|sno|sr_no|account_number|application_number|registration|engine_no|chassis_no|chasis_no|reference|receipt_number|battery_no)(_|$)/i.test(field);
}
function numericDimensionLike(field: string) {
  return /(^|_)(year|month|day|tenure|bucket|score|count|mob|age|frequency|vintage)(_|$)/i.test(field);
}
function nonCurrencyCountLike(field: string) {
  return /(count|number|qty|quantity|units|installments?|tenure|days?|months?|age|score|flag|_1_0|1_0)/i.test(field);
}
function financialField(field: string) {
  if (nonCurrencyCountLike(field)) return false;
  return /(amount|cost|price|salary|revenue|emi|demand|collection|principal|interest|receivable|payable|overdue|(^|_)pos($|_)|excess|charge|disbursed|sanctioned|adjusted|writeoff|payment|balance|profit|margin|dp_rs|_rs$)/i.test(field);
}
function percentageField(field: string) {
  return /(rate|percentage|percent|(^|_)irr($|_)|(^|_)ltv($|_)|ratio|share)/i.test(field);
}
function binaryRiskField(column: ContextColumn, riskPatterns: RegExp[]) {
  return ["INTEGER", "DECIMAL", "BOOLEAN"].includes(column.dataType)
    && column.uniqueCount > 0
    && column.uniqueCount <= 3
    && matchesAny(column.field, riskPatterns);
}
function identifierRank(field: string) {
  const patterns = [/loan_account|contract|application_number/i, /customer_id|global_cust|loan_id/i, /registration|engine|chassis|chasis|battery/i, /pan|aadhaar|aadhar|mobile/i];
  return patternRank(field, patterns);
}
function detectedCurrency(columns: ContextColumn[]) {
  const joined = columns.map((column) => `${column.field} ${column.label}`).join(" ");
  if (/(^|[^a-z])(rs|inr)([^a-z]|$)|₹/i.test(joined)) return "INR";
  if (/(^|[^a-z])usd([^a-z]|$)|\$/i.test(joined)) return "USD";
  if (/(^|[^a-z])eur([^a-z]|$)|€/i.test(joined)) return "EUR";
  if (/(^|[^a-z])gbp([^a-z]|$)|£/i.test(joined)) return "GBP";
  return null;
}
function dimensionRole(field: string, plugin: ReturnType<typeof detectAnalyticsDomain>): "CATEGORY" | "STATUS" | "GEOGRAPHY" | "ENTITY" | "RISK" | "SEGMENT" {
  if (/status|stage|bucket|state$/i.test(field) && !matchesAny(field, plugin.geographyFields)) return "STATUS";
  if (matchesAny(field, plugin.geographyFields)) return "GEOGRAPHY";
  if (matchesAny(field, plugin.riskFields)) return "RISK";
  if (matchesAny(field, plugin.entityFields)) return "ENTITY";
  if (/segment|cohort|vintage|band/i.test(field)) return "SEGMENT";
  return "CATEGORY";
}
function dateGrain(uniqueCount: number): "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR" {
  if (uniqueCount > 730) return "MONTH";
  if (uniqueCount > 120) return "MONTH";
  if (uniqueCount > 24) return "WEEK";
  return "MONTH";
}

export function createDeterministicSemanticModel(context: unknown): AnalyticsSemanticModel {
  const columns = contextColumns(context);
  const dataset = datasetInfo(context);
  const plugin = detectAnalyticsDomain(columns.map((column) => column.field));
  const defaultCurrencyCode = detectedCurrency(columns) ?? (plugin.key === "batfin" ? "INR" : null);
  const identifiers: AnalyticsSemanticModel["identifiers"] = [];
  const dimensions: AnalyticsSemanticModel["dimensions"] = [];
  const measures: AnalyticsSemanticModel["measures"] = [{
    id: "row_count",
    field: null,
    label: "Record Count",
    kind: "ROW_COUNT",
    aggregation: "COUNT",
    format: "NUMBER",
    currencyCode: null,
    unit: "records",
    role: "COUNT",
    additive: true,
    description: "Number of normalized records matching the current filters.",
    confidence: 1,
  }];
  const dateFields: AnalyticsSemanticModel["dateFields"] = [];

  for (const column of columns) {
    const constant = column.uniqueCount <= 1;
    const sparse = column.nullPercentage >= 90;
    if (column.sensitiveSamplesExcluded || identifierLike(column.field) || (column.dataType === "STRING" && column.uniqueCount >= 20 && column.cardinalityRatio >= 0.98)) {
      identifiers.push({
        field: column.field,
        label: column.label,
        description: `${column.label} identifies or references an individual record and is excluded from default aggregations.`,
        confidence: column.sensitiveSamplesExcluded ? 1 : 0.9,
      });
      continue;
    }
    if (column.dataType === "DATE" || column.dataType === "DATETIME") {
      if (!constant && !sparse) {
        dateFields.push({
          field: column.field,
          label: column.label,
          type: column.dataType,
          defaultGrain: dateGrain(column.uniqueCount),
          description: `${column.label} supports chronological grouping and date-range filtering.`,
          confidence: 0.95,
        });
      }
      continue;
    }
    if (binaryRiskField(column, plugin.riskFields)) {
      measures.push({
        id: column.field,
        field: column.field,
        label: column.label.replace(/\s*\(1\s*\/\s*0\)\s*/i, " Rate").replace(/\s+Rate Rate$/i, " Rate"),
        kind: "FIELD",
        aggregation: "AVG",
        format: "PERCENTAGE",
        currencyCode: null,
        unit: null,
        role: "RISK",
        additive: false,
        description: `${column.label} is a binary risk indicator summarized as the share of matching records.`,
        confidence: 0.95,
      });
      continue;
    }
    if (column.dataType === "BOOLEAN") {
      if (!constant && !sparse) dimensions.push({
        field: column.field,
        label: column.label,
        kind: "BOOLEAN",
        role: dimensionRole(column.field, plugin),
        description: `${column.label} is a true/false business dimension.`,
        confidence: 0.95,
      });
      continue;
    }
    if (column.dataType === "INTEGER" || column.dataType === "DECIMAL") {
      if (numericDimensionLike(column.field) && column.uniqueCount > 1 && column.uniqueCount <= 100 && !sparse) {
        dimensions.push({
          field: column.field,
          label: column.label,
          kind: "NUMERIC",
          role: dimensionRole(column.field, plugin),
          description: `${column.label} is a low-cardinality numeric dimension.`,
          confidence: 0.85,
        });
      } else if (!constant && !sparse) {
        const isPercentage = percentageField(column.field);
        const isCurrency = financialField(column.field) && Boolean(defaultCurrencyCode);
        measures.push({
          id: column.field,
          field: column.field,
          label: column.label,
          kind: "FIELD",
          aggregation: isPercentage ? "AVG" : "SUM",
          format: isPercentage ? "PERCENTAGE" : isCurrency ? "CURRENCY" : "NUMBER",
          currencyCode: isCurrency ? defaultCurrencyCode : null,
          unit: nonCurrencyCountLike(column.field) ? (/month|tenure/i.test(column.field) ? "months" : null) : null,
          role: isPercentage ? "RATE" : isCurrency ? "CURRENCY" : nonCurrencyCountLike(column.field) ? "QUANTITY" : "VALUE",
          additive: !isPercentage,
          description: `${column.label} is summarized using ${isPercentage ? "average" : "sum"} by default.`,
          confidence: 0.85,
        });
      }
      continue;
    }
    if (column.dataType === "STRING" && !constant && !sparse) {
      dimensions.push({
        field: column.field,
        label: column.label,
        kind: column.uniqueCount <= 250 || column.cardinalityRatio <= 0.25 ? "CATEGORY" : "TEXT",
        role: dimensionRole(column.field, plugin),
        description: `${column.label} is a ${column.uniqueCount <= 250 ? "categorical" : "text"} business dimension.`,
        confidence: 0.8,
      });
    }
  }

  identifiers.sort((left, right) => identifierRank(left.field) - identifierRank(right.field) || left.field.localeCompare(right.field));
  dimensions.sort((left, right) => patternRank(left.field, plugin.dimensionPriority) - patternRank(right.field, plugin.dimensionPriority) || left.field.localeCompare(right.field));
  const rowCountMeasure = measures[0]!;
  const fieldMeasures = measures.slice(1).sort((left, right) => patternRank(left.field ?? "", plugin.measurePriority) - patternRank(right.field ?? "", plugin.measurePriority) || (left.field ?? "").localeCompare(right.field ?? "")).slice(0, 34);
  const selectedDimensions = dimensions.slice(0, 35);
  const selectedDates = dateFields.slice(0, 20);
  const suggestedFilters: AnalyticsSemanticModel["suggestedFilters"] = [];
  for (const item of selectedDimensions) {
    if (suggestedFilters.length >= 15) break;
    suggestedFilters.push({
      field: item.field,
      label: item.label,
      type: item.kind === "BOOLEAN" ? "BOOLEAN" : item.kind === "TEXT" ? "SEARCH" : "MULTI_SELECT",
    });
  }
  for (const item of selectedDates) {
    if (suggestedFilters.length >= 20) break;
    suggestedFilters.push({ field: item.field, label: item.label, type: "DATE_RANGE" });
  }

  return {
    schemaVersion: 1,
    title: `${dataset.name} Semantic Model`.slice(0, 160),
    datasetSummary: `${dataset.name} contains ${dataset.rowCount.toLocaleString("en-IN")} records across ${dataset.columnCount} columns, with ${dataset.completeness}% completeness and ${dataset.duplicateRowCount.toLocaleString("en-IN")} duplicate rows detected.`,
    businessDomain: plugin.label,
    domainKey: plugin.key,
    defaultCurrencyCode,
    identifiers: identifiers.slice(0, 30),
    dimensions: selectedDimensions,
    measures: [rowCountMeasure, ...fieldMeasures],
    dateFields: selectedDates,
    suggestedFilters,
    calculatedMetrics: [],
  };
}

/**
 * Applies deterministic field-role, sparsity and unit rules after an AI response.
 * AI descriptions are retained, while physical type and aggregation correctness
 * remain owned by the deterministic engine.
 */
export function reconcileSemanticModel(candidate: AnalyticsSemanticModel, context: unknown) {
  const baseline = createDeterministicSemanticModel(context);
  const candidateIdentifiers = new Map(candidate.identifiers.map((item) => [item.field, item]));
  const candidateDimensions = new Map(candidate.dimensions.map((item) => [item.field, item]));
  const candidateMeasures = new Map(candidate.measures.map((item) => [item.id, item]));
  const candidateDates = new Map(candidate.dateFields.map((item) => [item.field, item]));
  const identifiers = baseline.identifiers.map((item) => {
    const proposed = candidateIdentifiers.get(item.field);
    return proposed ? { ...item, label: proposed.label, description: proposed.description, confidence: Math.min(item.confidence, proposed.confidence) } : item;
  });
  const dimensions = baseline.dimensions.map((item) => {
    const proposed = candidateDimensions.get(item.field);
    return proposed ? { ...item, label: proposed.label, description: proposed.description, confidence: Math.min(item.confidence, proposed.confidence) } : item;
  });
  const measures = baseline.measures.map((item) => {
    const proposed = candidateMeasures.get(item.id);
    return proposed ? { ...item, label: proposed.label, description: proposed.description, confidence: Math.min(item.confidence, proposed.confidence) } : item;
  });
  const dateFields = baseline.dateFields.map((item) => {
    const proposed = candidateDates.get(item.field);
    return proposed ? { ...item, label: proposed.label, description: proposed.description, confidence: Math.min(item.confidence, proposed.confidence) } : item;
  });
  const allowedFilters = new Set([...dimensions.map((item) => item.field), ...dateFields.map((item) => item.field)]);
  const proposedFilters = candidate.suggestedFilters.filter((item) => allowedFilters.has(item.field));
  const suggestedFilters = [...proposedFilters, ...baseline.suggestedFilters]
    .filter((item, index, all) => all.findIndex((candidateFilter) => candidateFilter.field === item.field) === index)
    .slice(0, 20);
  return {
    ...candidate,
    domainKey: baseline.domainKey,
    defaultCurrencyCode: baseline.defaultCurrencyCode,
    identifiers,
    dimensions,
    measures,
    dateFields,
    suggestedFilters,
    calculatedMetrics: candidate.calculatedMetrics.filter((metric) => {
      const numeric = new Set(measures.flatMap((measure) => measure.field ? [measure.field] : []));
      return numeric.has(metric.numeratorField) && numeric.has(metric.denominatorField);
    }),
  } satisfies AnalyticsSemanticModel;
}
