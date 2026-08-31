import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import type { AnalyticsDashboardSpecification } from "./analytics-dashboard.schemas.js";
import type { AnalyticsSemanticModel } from "./analytics-semantic.schemas.js";

interface Quality {
  uniqueCount: number;
  nullPercentage: number;
}

function contextQualities(context: unknown) {
  if (!context || typeof context !== "object" || !("columns" in context)) return new Map<string, Quality>();
  const columns = (context as { columns?: unknown }).columns;
  if (!Array.isArray(columns)) return new Map<string, Quality>();
  return new Map(columns.flatMap((item): Array<[string, Quality]> => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const column = item as Record<string, unknown>;
    if (typeof column.field !== "string") return [];
    return [[column.field, {
      uniqueCount: typeof column.uniqueCount === "number" ? column.uniqueCount : 0,
      nullPercentage: typeof column.nullPercentage === "number" ? column.nullPercentage : 0,
    }]];
  }));
}
function measureMeta(semantic: AnalyticsSemanticModel, id: string | null) {
  if (!id) return null;
  return semantic.measures.find((item) => item.id === id)
    ?? semantic.calculatedMetrics.find((item) => item.id === id)
    ?? null;
}
function dimensionMeta(semantic: AnalyticsSemanticModel, field: string | null) {
  if (!field) return null;
  return semantic.dimensions.find((item) => item.field === field)
    ?? semantic.dateFields.find((item) => item.field === field)
    ?? null;
}
export function canonicalVisualizationTitle(
  semantic: AnalyticsSemanticModel,
  item: Pick<AnalyticsDashboardSpecification["visualizations"][number], "type" | "measure" | "dimension" | "aggregation" | "stackBy">,
) {
  if (item.type === "TABLE") return "Case Explorer";
  const measure = measureMeta(semantic, item.measure);
  const measureLabel = measure?.label ?? item.measure ?? "Metric";
  if (item.type === "KPI") return measureLabel;
  const dimension = dimensionMeta(semantic, item.dimension);
  const dimensionLabel = dimension?.label ?? item.dimension ?? "Dimension";
  const isDate = semantic.dateFields.some((date) => date.field === item.dimension);
  if (isDate) return `${measureLabel} over time`;
  const stack = dimensionMeta(semantic, item.stackBy);
  const base = item.measure === "row_count" ? `Records by ${dimensionLabel}` : `${measureLabel} by ${dimensionLabel}`;
  return stack ? `${base} and ${stack.label}` : base;
}

export function reconcileDashboardSpecification(input: {
  specification: AnalyticsDashboardSpecification;
  semantic: AnalyticsSemanticModel;
  context: unknown;
}) {
  const qualities = contextQualities(input.context);
  const dateFields = new Set(input.semantic.dateFields.map((item) => item.field));
  const warnings: string[] = [];
  const filters = input.specification.filters.flatMap((filter) => {
    const quality = qualities.get(filter.field);
    if (quality?.uniqueCount === 1) {
      warnings.push(`Removed constant filter ${filter.field}`);
      return [];
    }
    if (quality && quality.nullPercentage >= 90) {
      warnings.push(`Removed sparse filter ${filter.field}`);
      return [];
    }
    if (quality && quality.uniqueCount > 250 && filter.type === "MULTI_SELECT") {
      warnings.push(`Converted high-cardinality filter ${filter.field} to search`);
      return [{ ...filter, type: "SEARCH" as const }];
    }
    return [filter];
  }).slice(0, 12);
  const seen = new Set<string>();
  const visualizations = input.specification.visualizations.flatMap((original) => {
    const item = { ...original };
    if (seen.has(item.id)) return [];
    seen.add(item.id);
    if (item.dimension) {
      const quality = qualities.get(item.dimension);
      if (quality?.uniqueCount === 1 || (quality && quality.nullPercentage >= 90)) {
        warnings.push(`Removed low-information chart ${item.id}`);
        return [];
      }
    }
    if (["LINE", "AREA", "STACKED_AREA"].includes(item.type) && item.dimension && !dateFields.has(item.dimension)) {
      item.type = item.stackBy ? "STACKED_BAR" : "BAR";
      item.timeGrain = "AUTO";
      warnings.push(`Changed incompatible time-series ${item.id} to ${item.type}`);
    }
    if (dateFields.has(item.dimension ?? "")) {
      if (["BAR", "PIE", "DONUT"].includes(item.type)) item.type = "LINE";
      item.sort = "TIME_ASC";
      item.showOther = false;
      if (item.timeGrain === "AUTO") {
        item.timeGrain = input.semantic.dateFields.find((date) => date.field === item.dimension)?.defaultGrain ?? "MONTH";
      }
    } else {
      item.timeGrain = "AUTO";
      if (item.sort === "TIME_ASC") item.sort = "VALUE_DESC";
    }
    const dimensionQuality = item.dimension ? qualities.get(item.dimension) : null;
    if (["PIE", "DONUT"].includes(item.type) && (dimensionQuality?.uniqueCount ?? 0) > 12) {
      item.type = "BAR";
      warnings.push(`Changed high-cardinality ${original.type} ${item.id} to BAR`);
    }
    if (item.stackBy) {
      const stackQuality = qualities.get(item.stackBy);
      if (stackQuality?.uniqueCount === 1 || (stackQuality && (stackQuality.uniqueCount > 20 || stackQuality.nullPercentage >= 90))) {
        item.stackBy = null;
        item.type = item.type === "STACKED_AREA" ? "AREA" : "BAR";
        warnings.push(`Removed incompatible stack field from ${item.id}`);
      }
    }
    item.topN = Math.min(item.topN, item.type === "DONUT" || item.type === "PIE" ? 12 : 50);
    item.limit = Math.max(item.limit, item.topN);
    item.title = canonicalVisualizationTitle(input.semantic, item);
    item.description = item.type === "TABLE"
      ? "Filter-aware records with pagination, column controls, row details, and export."
      : `${item.title}. Values are computed from the current PostgreSQL dataset version.`;
    return [item];
  });
  if (!visualizations.some((item) => item.type === "TABLE")) {
    const columns = [
      ...input.semantic.identifiers.slice(0, 2).map((item) => item.field),
      ...input.semantic.dimensions.slice(0, 5).map((item) => item.field),
      ...input.semantic.dateFields.slice(0, 2).map((item) => item.field),
      ...input.semantic.measures.filter((item) => item.field).slice(0, 5).map((item) => item.field!),
    ].filter((field, index, all) => all.indexOf(field) === index).slice(0, 14);
    if (columns.length) visualizations.push({
      id: "dataset_detail_table", type: "TABLE", title: "Case Explorer", description: "Filter-aware records with pagination, column controls, row details, and export.",
      dimension: null, measure: null, secondaryMeasure: null, aggregation: null, stackBy: null, columns, limit: 25,
      timeGrain: "AUTO", sort: "LABEL_ASC", topN: 25, showOther: false, formatOverride: "AUTO",
      layout: { x: 0, y: Math.max(2, ...visualizations.map((item) => item.layout.y + item.layout.h)), w: 12, h: 6 }, visible: true,
    });
  }
  return {
    specification: { ...input.specification, filters, visualizations },
    warnings,
  };
}

export async function preflightDashboardSpecification(input: {
  specification: AnalyticsDashboardSpecification;
  semantic: AnalyticsSemanticModel;
  datasetId: string;
  sheetId: string;
  datasetVersion: number;
}) {
  const warnings: string[] = [];
  const keep = await Promise.all(input.specification.visualizations.map(async (item) => {
    if (item.type === "TABLE" || item.measure === "row_count") return true;
    const measure = input.semantic.measures.find((candidate) => candidate.id === item.measure);
    if (!measure?.field) return true;
    const dimensionClause = item.dimension
      ? Prisma.sql`AND r."data" ->> ${item.dimension} IS NOT NULL`
      : Prisma.empty;
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "AnalyticsDatasetRow" r
      WHERE r."datasetId" = ${input.datasetId}
        AND r."sheetId" = ${input.sheetId}
        AND r."datasetVersion" = ${input.datasetVersion}
        AND jsonb_typeof(r."data" -> ${measure.field}) = 'number'
        ${dimensionClause}
      LIMIT 1
    `);
    const valid = Number(rows[0]?.count ?? 0) > 0;
    if (!valid) warnings.push(`Preflight removed ${item.id}: no compatible query data`);
    return valid;
  }));
  const visualizations = input.specification.visualizations.filter((_item, index) => keep[index]);
  return {
    specification: { ...input.specification, visualizations: visualizations.length ? visualizations : input.specification.visualizations.filter((item) => item.type === "TABLE" || item.measure === "row_count") },
    warnings,
  };
}
