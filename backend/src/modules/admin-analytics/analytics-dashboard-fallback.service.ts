import type { AnalyticsDashboardSpecification } from "./analytics-dashboard.schemas.js";
import type { AnalyticsSemanticModel } from "./analytics-semantic.schemas.js";

function cleanId(value: string) {
  const normalized = value.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
  return (/^[a-z]/.test(normalized) ? normalized : `widget_${normalized}`).slice(0, 100);
}
function contextRecord(context: unknown, key: string) {
  if (!context || typeof context !== "object" || !(key in context)) return null;
  const value = (context as Record<string, unknown>)[key];
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function datasetStats(context: unknown) {
  const value = contextRecord(context, "dataset") ?? {};
  return {
    rowCount: typeof value.rowCount === "number" ? value.rowCount : 0,
    columnCount: typeof value.columnCount === "number" ? value.columnCount : 0,
    completeness: typeof value.completenessPercentage === "number" ? value.completenessPercentage : 0,
    duplicates: typeof value.duplicateRowCount === "number" ? value.duplicateRowCount : 0,
  };
}
function contextColumns(context: unknown) {
  if (!context || typeof context !== "object" || !("columns" in context)) return [];
  const columns = (context as { columns?: unknown }).columns;
  if (!Array.isArray(columns)) return [];
  return columns.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item));
}
function qualityMap(context: unknown) {
  return new Map(contextColumns(context).map((item) => [String(item.field ?? ""), {
    uniqueCount: typeof item.uniqueCount === "number" ? item.uniqueCount : 0,
    nullPercentage: typeof item.nullPercentage === "number" ? item.nullPercentage : 0,
    topValues: Array.isArray(item.topValues) ? item.topValues : [],
  }]));
}
function chartTitle(semantic: AnalyticsSemanticModel, measureId: string, dimension: string, time = false) {
  const measure = semantic.measures.find((item) => item.id === measureId) ?? semantic.calculatedMetrics.find((item) => item.id === measureId);
  const dimensionItem = semantic.dimensions.find((item) => item.field === dimension) ?? semantic.dateFields.find((item) => item.field === dimension);
  const measureLabel = measure?.label ?? measureId;
  const dimensionLabel = dimensionItem?.label ?? dimension;
  if (time) return `${measureLabel} over time`;
  return measureId === "row_count" ? `Records by ${dimensionLabel}` : `${measureLabel} by ${dimensionLabel}`;
}

export function createDeterministicDashboardSpecification(semantic: AnalyticsSemanticModel, context: unknown): AnalyticsDashboardSpecification {
  const qualities = qualityMap(context);
  const usefulDimension = (field: string) => {
    const quality = qualities.get(field);
    return !quality || (quality.uniqueCount > 1 && quality.nullPercentage < 90);
  };
  const dimensions = semantic.dimensions.filter((item) => usefulDimension(item.field));
  const dates = semantic.dateFields.filter((item) => usefulDimension(item.field));
  const filters: AnalyticsDashboardSpecification["filters"] = semantic.suggestedFilters
    .filter((filter) => usefulDimension(filter.field))
    .slice(0, 8)
    .map((filter, index) => ({ id: cleanId(`filter_${filter.field}_${index + 1}`), field: filter.field, label: filter.label, type: filter.type }));
  const visualizations: AnalyticsDashboardSpecification["visualizations"] = [];
  const fieldMeasures = semantic.measures.filter((item) => item.kind === "FIELD");
  const riskMeasure = fieldMeasures.find((item) => item.role === "RISK" || /risk|delinquen|npa|repo|overdue/i.test(item.id));
  const primaryMeasures = fieldMeasures.filter((item) => item.role !== "RISK").slice(0, 3);
  const kpis = [semantic.measures.find((item) => item.id === "row_count"), ...primaryMeasures, riskMeasure]
    .filter((item, index, all): item is AnalyticsSemanticModel["measures"][number] => Boolean(item) && all.indexOf(item) === index)
    .slice(0, 4);
  kpis.forEach((measure, index) => {
    visualizations.push({
      id: cleanId(`kpi_${measure.id}`), type: "KPI", title: measure.label, description: measure.description,
      dimension: null, measure: measure.id, secondaryMeasure: null, aggregation: measure.aggregation,
      stackBy: null, columns: [], limit: 1, timeGrain: "AUTO", sort: "VALUE_DESC", topN: 1,
      showOther: false, formatOverride: "AUTO", layout: { x: (index % 4) * 3, y: 0, w: 3, h: 2 }, visible: true,
    });
  });
  const primaryMeasure = primaryMeasures[0] ?? riskMeasure ?? semantic.measures[0]!;
  let chartIndex = 0;
  const addChart = (type: "BAR" | "LINE" | "AREA" | "PIE" | "DONUT" | "STACKED_BAR", dimension: string, measure = primaryMeasure.id, stackBy: string | null = null) => {
    const date = dates.some((item) => item.field === dimension);
    const quality = qualities.get(dimension);
    const actualType = (type === "PIE" || type === "DONUT") && (quality?.uniqueCount ?? 0) > 12 ? "BAR" : type;
    const title = chartTitle(semantic, measure, dimension, date);
    visualizations.push({
      id: cleanId(`${actualType.toLowerCase()}_${dimension}_${measure}`), type: actualType, title,
      description: `${title}. Select a category to cross-filter the dashboard.`, dimension, measure,
      secondaryMeasure: null, aggregation: semantic.measures.find((item) => item.id === measure)?.aggregation ?? "SUM",
      stackBy, columns: [], limit: date ? 120 : 50, timeGrain: date ? "AUTO" : "AUTO",
      sort: date ? "TIME_ASC" : "VALUE_DESC", topN: date ? 100 : 10, showOther: !date,
      formatOverride: "AUTO", layout: { x: (chartIndex % 2) * 6, y: 2 + Math.floor(chartIndex / 2) * 4, w: 6, h: 4 }, visible: true,
    });
    chartIndex += 1;
  };
  if (dates[0]) addChart("LINE", dates[0].field);
  const status = dimensions.find((item) => item.role === "STATUS" || /status|bucket/i.test(item.field));
  const geography = dimensions.find((item) => item.role === "GEOGRAPHY");
  const entity = dimensions.find((item) => item.role === "ENTITY");
  const categorical = dimensions.filter((item) => ![status?.field, geography?.field, entity?.field].includes(item.field));
  if (status) addChart("DONUT", status.field, "row_count");
  if (geography) addChart("BAR", geography.field);
  if (entity) addChart("BAR", entity.field, riskMeasure?.id ?? primaryMeasure.id);
  if (categorical[0] && chartIndex < 5) addChart("BAR", categorical[0].field);
  if (dimensions.length >= 2 && chartIndex < 5) {
    const base = status ?? dimensions[0]!;
    const stack = dimensions.find((item) => item.field !== base.field && (qualities.get(item.field)?.uniqueCount ?? 99) <= 12);
    if (stack) addChart("STACKED_BAR", base.field, primaryMeasure.id, stack.field);
  }
  const tableColumns = [
    ...semantic.identifiers.slice(0, 2).map((item) => item.field),
    ...dimensions.slice(0, 6).map((item) => item.field),
    ...dates.slice(0, 2).map((item) => item.field),
    ...fieldMeasures.filter((item) => item.field).slice(0, 5).map((item) => item.field!),
  ].filter((field, index, all) => all.indexOf(field) === index).slice(0, 14);
  const tableY = 2 + Math.ceil(chartIndex / 2) * 4;
  visualizations.push({
    id: "dataset_detail_table", type: "TABLE", title: "Case Explorer", description: "Paginated, filter-aware normalized records with row details and export.",
    dimension: null, measure: null, secondaryMeasure: null, aggregation: null, stackBy: null,
    columns: tableColumns, limit: 25, timeGrain: "AUTO", sort: "LABEL_ASC", topN: 25,
    showOther: false, formatOverride: "AUTO", layout: { x: 0, y: tableY, w: 12, h: 6 }, visible: true,
  });
  const stats = datasetStats(context);
  const notable = dimensions.map((dimension) => ({ dimension, quality: qualities.get(dimension.field) }))
    .find((item) => item.quality?.topValues.length);
  const insights: AnalyticsDashboardSpecification["insights"] = [
    {
      id: "dataset_coverage", title: "Analysis coverage",
      content: `${stats.rowCount.toLocaleString("en-IN")} normalized records are available across ${stats.columnCount} profiled columns. All displayed metrics are computed from PostgreSQL at query time.`,
      evidence: [{ kind: "PROFILE_STAT", field: null, metric: "row_count", value: stats.rowCount }, { kind: "PROFILE_STAT", field: null, metric: "column_count", value: stats.columnCount }], confidence: 1,
    },
    {
      id: "data_quality", title: "Quality readiness",
      content: `${stats.completeness}% of profiled cells are populated; ${stats.duplicates.toLocaleString("en-IN")} duplicate rows were detected. Sparse and constant fields are excluded from default charts.`,
      evidence: [{ kind: "PROFILE_STAT", field: null, metric: "completeness_percentage", value: stats.completeness }, { kind: "PROFILE_STAT", field: null, metric: "duplicate_row_count", value: stats.duplicates }], confidence: 1,
    },
  ];
  if (notable) insights.push({
    id: "concentration_check", title: "Concentration opportunity",
    content: `${notable.dimension.label} has a meaningful category distribution. Use the linked chart and “View evidence” to identify concentration rather than relying on static narrative.`,
    evidence: [{ kind: "QUERY_REQUIRED", field: notable.dimension.field, metric: "top_n_share", value: null }], confidence: 0.85,
  });
  return {
    schemaVersion: 1,
    title: semantic.title.replace(/ Semantic Model$/i, " Analytics").slice(0, 160),
    description: `Interactive analytics for ${semantic.businessDomain.toLowerCase()}. Metrics, rankings, filters, and evidence are computed deterministically from the current dataset version.`,
    filters,
    visualizations,
    insights,
  };
}
