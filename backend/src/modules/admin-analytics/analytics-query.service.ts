import { Prisma } from "@prisma/client";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import {
  analyticsBatchQuerySchema,
  analyticsExportSchema,
  analyticsFilterOptionsSchema,
  analyticsQuerySchema,
  type AnalyticsFilterValue,
  type AnalyticsQueryInput,
} from "./analytics-query.schemas.js";
import type { AnalyticsSemanticModel } from "./analytics-semantic.schemas.js";

function validationMessage(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  return error.issues.slice(0, 8).map((issue) => `${issue.path.join(".") || "query"}: ${issue.message}`).join("; ");
}

export async function loadDashboardQueryContext(dashboardId: string, adminUserId: string) {
  const dashboard = await prisma.analyticsDashboard.findFirst({
    where: { id: dashboardId, ownerAdminId: adminUserId, deletedAt: null },
    include: { dataset: true, currentVersion: { include: { semanticModel: true } } },
  });
  if (!dashboard?.currentVersion?.semanticModel || !dashboard.dataset.activeSheetId) {
    throw new ApiError(404, "Analytics dashboard not found or incomplete", "ANALYTICS_DASHBOARD_NOT_FOUND");
  }
  const columns = await prisma.analyticsDatasetColumn.findMany({
    where: { datasetId: dashboard.datasetId, sheetId: dashboard.dataset.activeSheetId },
    select: { normalizedName: true, displayName: true, dataType: true, uniqueCount: true, nullPercentage: true },
    orderBy: { ordinal: "asc" },
  });
  return {
    dashboard,
    dataset: dashboard.dataset,
    version: dashboard.currentVersion,
    semantic: dashboard.currentVersion.semanticModel.semanticModel as unknown as AnalyticsSemanticModel,
    columns,
  };
}

type DashboardQueryContext = Awaited<ReturnType<typeof loadDashboardQueryContext>>;

function numericType(value: string) {
  return value === "INTEGER" || value === "DECIMAL";
}
function filterSql(filter: AnalyticsFilterValue, columnType: string) {
  const field = filter.field;
  if (filter.type === "NUMERIC_RANGE") {
    if (!numericType(columnType)) throw new ApiError(400, `${field} is not numeric`, "ANALYTICS_QUERY_TYPE_MISMATCH");
    const clauses: Prisma.Sql[] = [Prisma.sql`jsonb_typeof(r."data" -> ${field}) = 'number'`];
    if (filter.from !== undefined) clauses.push(Prisma.sql`(r."data" ->> ${field})::numeric >= ${Number(filter.from)}`);
    if (filter.to !== undefined) clauses.push(Prisma.sql`(r."data" ->> ${field})::numeric <= ${Number(filter.to)}`);
    return Prisma.sql`(${Prisma.join(clauses, " AND ")})`;
  }
  if (filter.type === "DATE_RANGE") {
    if (!["DATE", "DATETIME"].includes(columnType)) throw new ApiError(400, `${field} is not a date`, "ANALYTICS_QUERY_TYPE_MISMATCH");
    const clauses: Prisma.Sql[] = [];
    if (filter.from !== undefined) clauses.push(Prisma.sql`r."data" ->> ${field} >= ${String(filter.from)}`);
    if (filter.to !== undefined) clauses.push(Prisma.sql`r."data" ->> ${field} <= ${String(filter.to)}`);
    return Prisma.sql`(${Prisma.join(clauses, " AND ")})`;
  }
  if (filter.type === "MULTI_SELECT") {
    return Prisma.sql`r."data" ->> ${field} IN (${Prisma.join((filter.values ?? []).map((value) => Prisma.sql`${String(value)}`))})`;
  }
  if (filter.type === "SEARCH") {
    const escaped = String(filter.value).replace(/[\\%_]/g, "\\$&");
    return Prisma.sql`r."data" ->> ${field} ILIKE ${`%${escaped}%`} ESCAPE '\\'`;
  }
  return Prisma.sql`r."data" ->> ${field} = ${String(filter.value)}`;
}
function numericValue(field: string) {
  return Prisma.sql`CASE WHEN jsonb_typeof("data" -> ${field}) = 'number' THEN ("data" ->> ${field})::numeric ELSE NULL END`;
}
function aggregateField(field: string, aggregation: string) {
  const value = numericValue(field);
  if (aggregation === "AVG") return Prisma.sql`AVG(${value})`;
  if (aggregation === "MIN") return Prisma.sql`MIN(${value})`;
  if (aggregation === "MAX") return Prisma.sql`MAX(${value})`;
  if (aggregation === "COUNT") return Prisma.sql`COUNT(${value})::numeric`;
  return Prisma.sql`SUM(${value})`;
}
function measureDefinition(semantic: AnalyticsSemanticModel, measureId: string) {
  return semantic.measures.find((item) => item.id === measureId)
    ?? semantic.calculatedMetrics.find((item) => item.id === measureId)
    ?? null;
}
function measureExpression(semantic: AnalyticsSemanticModel, measureId: string, override?: string | null) {
  const measure = semantic.measures.find((item) => item.id === measureId);
  if (measure) {
    if (measure.kind === "ROW_COUNT") return Prisma.sql`COUNT(*)::numeric`;
    return aggregateField(measure.field!, override ?? measure.aggregation);
  }
  const calculated = semantic.calculatedMetrics.find((item) => item.id === measureId);
  if (!calculated) throw new ApiError(400, `Unknown measure: ${measureId}`, "ANALYTICS_QUERY_FIELD_INVALID");
  const numerator = aggregateField(calculated.numeratorField, "SUM");
  const denominator = aggregateField(calculated.denominatorField, "SUM");
  if (calculated.operation === "DIFFERENCE") return Prisma.sql`((${numerator}) - (${denominator})) * ${calculated.multiplier}`;
  return Prisma.sql`((${numerator}) / NULLIF((${denominator}), 0)) * ${calculated.multiplier}`;
}
function numberOrNull(value: unknown) {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function measureFormat(semantic: AnalyticsSemanticModel, measureId: string) {
  const measure = measureDefinition(semantic, measureId) as { format?: string; currencyCode?: string | null; unit?: string | null; label?: string } | null;
  const format = measure?.format ?? "NUMBER";
  return {
    format,
    currencyCode: format === "CURRENCY" ? measure?.currencyCode ?? semantic.defaultCurrencyCode ?? null : null,
    unit: measure?.unit ?? null,
    label: measure?.label ?? measureId,
  };
}
function baseWhere(context: DashboardQueryContext, input: AnalyticsQueryInput) {
  const columnTypes = new Map(context.columns.map((column) => [column.normalizedName, column.dataType]));
  const referenced = [input.dimension, input.stackBy, ...(input.fields ?? []), ...input.filters.map((item) => item.field)].filter((item): item is string => Boolean(item));
  for (const field of referenced) if (!columnTypes.has(field)) throw new ApiError(400, `Unknown dataset field: ${field}`, "ANALYTICS_QUERY_FIELD_INVALID");
  const filterParts = input.filters.map((filter) => filterSql(filter, columnTypes.get(filter.field)!));
  return {
    columnTypes,
    where: Prisma.sql`
      r."datasetId" = ${context.dataset.id}
      AND r."sheetId" = ${context.dataset.activeSheetId!}
      AND r."datasetVersion" = ${context.version.datasetVersion}
      ${filterParts.length ? Prisma.sql`AND ${Prisma.join(filterParts, " AND ")}` : Prisma.empty}
    `,
  };
}
function finalOrder(sort: AnalyticsQueryInput["sort"]) {
  if (sort === "VALUE_ASC") return Prisma.sql`value ASC NULLS LAST, dimension ASC`;
  if (sort === "LABEL_ASC") return Prisma.sql`dimension ASC, value DESC NULLS LAST`;
  if (sort === "LABEL_DESC") return Prisma.sql`dimension DESC, value DESC NULLS LAST`;
  if (sort === "TIME_ASC") return Prisma.sql`dimension ASC`;
  return Prisma.sql`value DESC NULLS LAST, dimension ASC`;
}
function resolvedTimeGrain(context: DashboardQueryContext, input: AnalyticsQueryInput) {
  if (input.timeGrain !== "AUTO") return input.timeGrain;
  return context.semantic.dateFields.find((item) => item.field === input.dimension)?.defaultGrain ?? "MONTH";
}

async function executeParsedAnalyticsQuery(context: DashboardQueryContext, input: AnalyticsQueryInput) {
  const { columnTypes, where } = baseWhere(context, input);
  if (input.mode === "TABLE") {
    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`SELECT COUNT(*)::bigint AS count FROM "AnalyticsDatasetRow" r WHERE ${where}`);
    const offset = (input.page - 1) * input.pageSize;
    const rows = await prisma.$queryRaw<Array<{ rowNumber: number; data: Record<string, unknown> }>>(Prisma.sql`
      SELECT r."rowNumber", r."data" FROM "AnalyticsDatasetRow" r
      WHERE ${where} ORDER BY r."rowNumber" ASC LIMIT ${input.pageSize} OFFSET ${offset}
    `);
    const total = Number(totalRows[0]?.count ?? 0);
    return {
      mode: "TABLE" as const,
      fields: input.fields!,
      fieldTypes: Object.fromEntries(input.fields!.map((field) => [field, columnTypes.get(field) ?? "UNKNOWN"])),
      rows: rows.map((row) => ({ rowNumber: row.rowNumber, data: Object.fromEntries(input.fields!.map((field) => [field, row.data[field] ?? null])) })),
      pagination: { page: input.page, pageSize: input.pageSize, total, totalPages: Math.max(1, Math.ceil(total / input.pageSize)) },
    };
  }

  const primaryDefinition = context.semantic.measures.find((item) => item.id === input.measure);
  if (input.mode === "HISTOGRAM") {
    if (!primaryDefinition?.field) throw new ApiError(400, "Histogram requires a physical numeric measure", "ANALYTICS_QUERY_TYPE_MISMATCH");
    const field = primaryDefinition.field;
    const rows = await prisma.$queryRaw<Array<{ bucket: number; lower: unknown; upper: unknown; count: bigint }>>(Prisma.sql`
      WITH values AS (
        SELECT (r."data" ->> ${field})::numeric AS value
        FROM "AnalyticsDatasetRow" r WHERE ${where} AND jsonb_typeof(r."data" -> ${field}) = 'number'
      ), bounds AS (SELECT MIN(value) AS minimum, MAX(value) AS maximum FROM values), bucketed AS (
        SELECT width_bucket(value, minimum, NULLIF(maximum, minimum), ${input.bins}) AS bucket,
               minimum, maximum FROM values CROSS JOIN bounds WHERE minimum IS NOT NULL
      )
      SELECT bucket,
             MIN(minimum + (bucket - 1) * (maximum - minimum) / ${input.bins}) AS lower,
             MAX(minimum + bucket * (maximum - minimum) / ${input.bins}) AS upper,
             COUNT(*)::bigint AS count
      FROM bucketed GROUP BY bucket ORDER BY bucket ASC
    `);
    return {
      mode: "HISTOGRAM" as const,
      measure: input.measure!,
      format: measureFormat(context.semantic, input.measure!),
      rows: rows.map((row) => ({ bucket: row.bucket, lower: numberOrNull(row.lower), upper: numberOrNull(row.upper), value: Number(row.count) })),
    };
  }
  if (input.mode === "CORRELATION") {
    const secondaryDefinition = context.semantic.measures.find((item) => item.id === input.secondaryMeasure);
    if (!primaryDefinition?.field || !secondaryDefinition?.field) throw new ApiError(400, "Correlation requires two physical numeric measures", "ANALYTICS_QUERY_TYPE_MISMATCH");
    const rows = await prisma.$queryRaw<Array<{ correlation: unknown; rowCount: bigint }>>(Prisma.sql`
      SELECT CORR((r."data" ->> ${primaryDefinition.field})::numeric, (r."data" ->> ${secondaryDefinition.field})::numeric) AS correlation,
             COUNT(*)::bigint AS "rowCount"
      FROM "AnalyticsDatasetRow" r WHERE ${where}
        AND jsonb_typeof(r."data" -> ${primaryDefinition.field}) = 'number'
        AND jsonb_typeof(r."data" -> ${secondaryDefinition.field}) = 'number'
    `);
    return {
      mode: "CORRELATION" as const,
      measure: input.measure!, secondaryMeasure: input.secondaryMeasure!,
      correlation: numberOrNull(rows[0]?.correlation), rowCount: Number(rows[0]?.rowCount ?? 0),
    };
  }

  const measure = measureExpression(context.semantic, input.measure!, input.aggregation);
  const secondary = input.secondaryMeasure ? measureExpression(context.semantic, input.secondaryMeasure, input.aggregation) : null;
  const format = measureFormat(context.semantic, input.measure!);
  if (!input.dimension) {
    const rows = await prisma.$queryRaw<Array<{ value: unknown; secondaryValue: unknown; rowCount: bigint }>>(Prisma.sql`
      WITH filtered AS (SELECT r."data" FROM "AnalyticsDatasetRow" r WHERE ${where})
      SELECT ${measure} AS value, ${secondary ?? Prisma.sql`NULL`} AS "secondaryValue", COUNT(*)::bigint AS "rowCount" FROM filtered
    `);
    return {
      mode: "AGGREGATE" as const, dimension: null, measure: input.measure!, format,
      timeGrain: null, rows: [{ dimension: null, value: numberOrNull(rows[0]?.value), secondaryValue: numberOrNull(rows[0]?.secondaryValue), rowCount: Number(rows[0]?.rowCount ?? 0) }],
    };
  }
  const dimension = input.dimension;
  const stackBy = input.stackBy;
  if (stackBy === dimension) throw new ApiError(400, "Stack field must differ from dimension", "ANALYTICS_QUERY_FIELD_INVALID");
  const stackColumn = stackBy ? context.columns.find((column) => column.normalizedName === stackBy) : null;
  if (stackColumn && stackColumn.uniqueCount > 50) throw new ApiError(400, "Stack field has too many categories", "ANALYTICS_QUERY_CARDINALITY_HIGH");
  const isDate = ["DATE", "DATETIME"].includes(columnTypes.get(dimension) ?? "");
  const grain = isDate ? resolvedTimeGrain(context, input) : null;
  const dimensionExpression = isDate
    ? Prisma.sql`date_trunc(${grain!.toLowerCase()}, NULLIF(r."data" ->> ${dimension}, '')::timestamp)::date::text`
    : Prisma.sql`r."data" ->> ${dimension}`;
  const stackExpression = stackBy ? Prisma.sql`r."data" ->> ${stackBy}` : Prisma.sql`NULL::text`;
  type GroupRow = { dimension: string | null; stack: string | null; value: unknown; secondaryValue: unknown; rowCount: bigint };
  let rows: GroupRow[];
  if (isDate) {
    rows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      WITH filtered AS (
        SELECT r."data", ${dimensionExpression} AS dimension, ${stackExpression} AS stack
        FROM "AnalyticsDatasetRow" r WHERE ${where}
      )
      SELECT dimension, stack, ${measure} AS value, ${secondary ?? Prisma.sql`NULL`} AS "secondaryValue", COUNT(*)::bigint AS "rowCount"
      FROM filtered WHERE dimension IS NOT NULL GROUP BY 1, 2
      ORDER BY dimension ASC LIMIT ${input.limit}
    `);
  } else {
    const topN = Math.min(input.topN, input.limit);
    const minGroupSize = Math.max(input.minGroupSize, primaryDefinition?.role === "RISK" ? 5 : 1);
    const labeledRestriction = input.showOther ? Prisma.empty : Prisma.sql`WHERE totals.dimension IS NOT NULL`;
    rows = await prisma.$queryRaw<GroupRow[]>(Prisma.sql`
      WITH filtered AS (
        SELECT r."data", ${dimensionExpression} AS dimension, ${stackExpression} AS stack
        FROM "AnalyticsDatasetRow" r WHERE ${where}
      ), dimension_totals AS (
        SELECT dimension, ${measure} AS rank_value
        FROM filtered WHERE dimension IS NOT NULL
        GROUP BY dimension HAVING COUNT(*) >= ${minGroupSize}
        ORDER BY rank_value DESC NULLS LAST, dimension ASC LIMIT ${topN}
      ), labeled AS (
        SELECT f."data", CASE WHEN totals.dimension IS NULL THEN 'Other' ELSE f.dimension END AS dimension, f.stack
        FROM filtered f LEFT JOIN dimension_totals totals ON totals.dimension = f.dimension
        ${labeledRestriction}
      )
      SELECT dimension, stack, ${measure} AS value, ${secondary ?? Prisma.sql`NULL`} AS "secondaryValue", COUNT(*)::bigint AS "rowCount"
      FROM labeled WHERE dimension IS NOT NULL GROUP BY 1, 2
      ORDER BY CASE WHEN dimension = 'Other' THEN 1 ELSE 0 END, ${finalOrder(input.sort)}
    `);
  }
  return {
    mode: "AGGREGATE" as const,
    dimension,
    stackBy: stackBy ?? null,
    measure: input.measure!,
    format,
    timeGrain: grain,
    rows: rows.map((row) => ({ dimension: row.dimension, stack: row.stack, value: numberOrNull(row.value), secondaryValue: numberOrNull(row.secondaryValue), rowCount: Number(row.rowCount) })),
  };
}

export async function executeAnalyticsQuery(dashboardId: string, adminUserId: string, rawInput: unknown) {
  const parsed = analyticsQuerySchema.safeParse(rawInput);
  if (!parsed.success) throw new ApiError(400, validationMessage(parsed.error), "ANALYTICS_QUERY_INVALID");
  return executeParsedAnalyticsQuery(await loadDashboardQueryContext(dashboardId, adminUserId), parsed.data);
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function widgetInput(widget: { type: string; dimensionField: string | null; measureField: string | null; aggregation: string | null; configuration: unknown }, body: Record<string, unknown>) {
  const configuration = object(widget.configuration);
  return {
    mode: widget.type === "TABLE" ? "TABLE" : "AGGREGATE",
    dimension: widget.dimensionField,
    stackBy: typeof configuration.stackBy === "string" ? configuration.stackBy : null,
    measure: widget.measureField,
    secondaryMeasure: typeof configuration.secondaryMeasure === "string" ? configuration.secondaryMeasure : null,
    aggregation: widget.aggregation,
    fields: Array.isArray(body.fields) ? body.fields : Array.isArray(configuration.columns) ? configuration.columns : undefined,
    filters: Array.isArray(body.filters) ? body.filters : [],
    limit: typeof body.limit === "number" ? body.limit : typeof configuration.limit === "number" ? configuration.limit : 50,
    topN: typeof body.topN === "number" ? body.topN : typeof configuration.topN === "number" ? configuration.topN : 10,
    showOther: typeof body.showOther === "boolean" ? body.showOther : configuration.showOther !== false,
    timeGrain: typeof body.timeGrain === "string" ? body.timeGrain : typeof configuration.timeGrain === "string" ? configuration.timeGrain : "AUTO",
    sort: typeof body.sort === "string" ? body.sort : typeof configuration.sort === "string" ? configuration.sort : "VALUE_DESC",
    page: typeof body.page === "number" ? body.page : 1,
    pageSize: typeof body.pageSize === "number" ? body.pageSize : typeof configuration.limit === "number" ? Math.min(100, configuration.limit) : 25,
  };
}

export async function visualizationQuery(dashboardId: string, widgetKey: string, adminUserId: string, rawBody: unknown) {
  const context = await loadDashboardQueryContext(dashboardId, adminUserId);
  const widget = await prisma.analyticsDashboardVisualization.findFirst({ where: { dashboardVersionId: context.version.id, widgetKey } });
  if (!widget) throw new ApiError(404, "Dashboard visualization not found", "ANALYTICS_VISUALIZATION_NOT_FOUND");
  const parsed = analyticsQuerySchema.safeParse(widgetInput(widget, object(rawBody)));
  if (!parsed.success) throw new ApiError(400, validationMessage(parsed.error), "ANALYTICS_QUERY_INVALID");
  return executeParsedAnalyticsQuery(context, parsed.data);
}

export async function batchVisualizationQuery(dashboardId: string, adminUserId: string, rawInput: unknown) {
  const parsed = analyticsBatchQuerySchema.safeParse(rawInput);
  if (!parsed.success) throw new ApiError(400, validationMessage(parsed.error), "ANALYTICS_BATCH_QUERY_INVALID");
  const context = await loadDashboardQueryContext(dashboardId, adminUserId);
  const widgets = await prisma.analyticsDashboardVisualization.findMany({
    where: { dashboardVersionId: context.version.id, visible: true, ...(parsed.data.widgetKeys ? { widgetKey: { in: parsed.data.widgetKeys } } : {}) },
    orderBy: { sortOrder: "asc" }, take: 20,
  });
  const entries = await Promise.all(widgets.map(async (widget) => {
    const query = analyticsQuerySchema.safeParse(widgetInput(widget, { filters: parsed.data.filters }));
    if (!query.success) return [widget.widgetKey, { error: validationMessage(query.error) }] as const;
    try {
      return [widget.widgetKey, { result: await executeParsedAnalyticsQuery(context, query.data) }] as const;
    } catch (error) {
      return [widget.widgetKey, { error: error instanceof Error ? error.message : "Query failed" }] as const;
    }
  }));
  return { dashboardVersion: context.version.version, widgets: Object.fromEntries(entries) };
}

const optionCache = new Map<string, { expiresAt: number; value: unknown }>();
export async function analyticsFilterOptions(dashboardId: string, adminUserId: string, rawInput: unknown) {
  const parsed = analyticsFilterOptionsSchema.safeParse(rawInput);
  if (!parsed.success) throw new ApiError(400, validationMessage(parsed.error), "ANALYTICS_FILTER_OPTIONS_INVALID");
  const context = await loadDashboardQueryContext(dashboardId, adminUserId);
  const input = parsed.data;
  const column = context.columns.find((item) => item.normalizedName === input.field);
  if (!column) throw new ApiError(400, `Unknown dataset field: ${input.field}`, "ANALYTICS_QUERY_FIELD_INVALID");
  const cacheKey = JSON.stringify([context.version.id, input.field, input.search, input.limit, input.filters]);
  const cached = optionCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  if (optionCache.size > 500) optionCache.clear();
  const queryInput = analyticsQuerySchema.parse({ mode: "AGGREGATE", measure: "row_count", filters: input.filters });
  const { where } = baseWhere(context, queryInput);
  const escaped = input.search.replace(/[\\%_]/g, "\\$&");
  const search = input.search ? Prisma.sql`AND r."data" ->> ${input.field} ILIKE ${`%${escaped}%`} ESCAPE '\\'` : Prisma.empty;
  const rows = await prisma.$queryRaw<Array<{ value: string; count: bigint }>>(Prisma.sql`
    SELECT r."data" ->> ${input.field} AS value, COUNT(*)::bigint AS count
    FROM "AnalyticsDatasetRow" r WHERE ${where} AND r."data" ->> ${input.field} IS NOT NULL ${search}
    GROUP BY 1 ORDER BY count DESC, value ASC LIMIT ${input.limit}
  `);
  const value = { field: input.field, search: input.search, hasMore: rows.length === input.limit, options: rows.map((row) => ({ value: row.value, count: Number(row.count) })) };
  optionCache.set(cacheKey, { expiresAt: Date.now() + 30_000, value });
  return value;
}

function csvCell(value: unknown) {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (/^[=+@-]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}
export async function exportAnalyticsRows(dashboardId: string, adminUserId: string, rawInput: unknown) {
  const parsed = analyticsExportSchema.safeParse(rawInput);
  if (!parsed.success) throw new ApiError(400, validationMessage(parsed.error), "ANALYTICS_EXPORT_INVALID");
  const context = await loadDashboardQueryContext(dashboardId, adminUserId);
  const base = analyticsQuerySchema.parse({ mode: "TABLE", fields: parsed.data.fields, filters: parsed.data.filters });
  const { where } = baseWhere(context, base);
  const rows = await prisma.$queryRaw<Array<{ rowNumber: number; data: Record<string, unknown> }>>(Prisma.sql`
    SELECT r."rowNumber", r."data" FROM "AnalyticsDatasetRow" r
    WHERE ${where} ORDER BY r."rowNumber" ASC LIMIT ${parsed.data.limit}
  `);
  const header = ["row_number", ...parsed.data.fields].map(csvCell).join(",");
  const lines = rows.map((row) => [row.rowNumber, ...parsed.data.fields.map((field) => row.data[field] ?? null)].map(csvCell).join(","));
  const safeTitle = context.dashboard.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "analytics";
  return { csv: `\uFEFF${[header, ...lines].join("\r\n")}\r\n`, fileName: `${safeTitle}-export.csv`, rowCount: rows.length };
}

export async function queryBackedInsights(dashboardId: string, adminUserId: string, filters: unknown) {
  const parsedFilters = Array.isArray(filters) ? filters : [];
  const batch = await batchVisualizationQuery(dashboardId, adminUserId, { filters: parsedFilters });
  const insights: Array<{ id: string; title: string; content: string; confidence: number; evidence: unknown[] }> = [];
  for (const [widgetKey, entry] of Object.entries(batch.widgets)) {
    const result = (entry as { result?: { mode?: string; timeGrain?: string | null; format?: { format?: string }; rows?: Array<{ dimension?: string | null; value?: number | null }> } }).result;
    if (result?.mode !== "AGGREGATE" || result.format?.format === "PERCENTAGE" || !result.rows || result.rows.length < 2 || !result.rows[0]?.dimension) continue;
    const numericRows = result.rows.filter((row) => typeof row.value === "number");
    const total = numericRows.reduce((sum, row) => sum + Math.abs(row.value ?? 0), 0);
    const top = [...numericRows].sort((left, right) => Math.abs(right.value ?? 0) - Math.abs(left.value ?? 0))[0];
    if (!top || !total) continue;
    const share = Math.abs(top.value ?? 0) / total;
    if (result.timeGrain && numericRows.length >= 2) {
      const latest = numericRows[numericRows.length - 1]!;
      const previous = numericRows[numericRows.length - 2]!;
      const change = previous.value ? ((latest.value ?? 0) - previous.value) / Math.abs(previous.value) : null;
      if (change !== null && Number.isFinite(change)) {
        insights.push({
          id: `trend_${widgetKey}`,
          title: change >= 0 ? "Latest-period increase" : "Latest-period decrease",
          content: `${latest.dimension} changed ${(Math.abs(change) * 100).toFixed(1)}% ${change >= 0 ? "above" : "below"} the preceding visible period.`,
          confidence: 1,
          evidence: [{ kind: "QUERY_RESULT", widgetKey, currentPeriod: latest.dimension, currentValue: latest.value, previousPeriod: previous.dimension, previousValue: previous.value, change }],
        });
      }
    }
    if (insights.length < 3) insights.push({
      id: `evidence_${widgetKey}`,
      title: result.timeGrain ? "Peak period" : share >= 0.5 ? "High concentration" : "Leading segment",
      content: result.timeGrain
        ? `${top.dimension} is the peak visible period and represents ${(share * 100).toFixed(1)}% of the displayed absolute total.`
        : `${top.dimension} is the leading visible segment and represents ${(share * 100).toFixed(1)}% of the displayed absolute total.`,
      confidence: 1,
      evidence: [{ kind: "QUERY_RESULT", widgetKey, dimension: top.dimension, value: top.value, displayedTotal: total, share }],
    });
    if (insights.length >= 3) break;
  }
  return { generatedAt: new Date().toISOString(), insights };
}
