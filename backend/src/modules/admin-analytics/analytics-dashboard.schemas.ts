import { z } from "zod";
import type { AnalyticsSemanticModel } from "./analytics-semantic.schemas.js";

export const visualizationTypes = ["KPI", "BAR", "LINE", "AREA", "PIE", "DONUT", "SCATTER", "TABLE", "STACKED_BAR", "STACKED_AREA"] as const;
export const aggregationTypes = ["SUM", "AVG", "MIN", "MAX", "COUNT"] as const;
export const timeGrains = ["AUTO", "DAY", "WEEK", "MONTH", "QUARTER", "YEAR"] as const;
export const sortModes = ["VALUE_DESC", "VALUE_ASC", "LABEL_ASC", "LABEL_DESC", "TIME_ASC"] as const;

const fieldName = z.string().min(1).max(255).regex(/^[\p{L}\p{N}_]+$/u);
const identifier = z.string().min(1).max(120).regex(/^[a-z][a-z0-9_]*$/);

const filterSchema = z.object({
  id: identifier,
  field: fieldName,
  label: z.string().min(1).max(200),
  type: z.enum(["SELECT", "MULTI_SELECT", "DATE_RANGE", "NUMERIC_RANGE", "BOOLEAN", "SEARCH"]),
}).strict();

const layoutSchema = z.object({
  x: z.number().int().min(0).max(11),
  y: z.number().int().min(0).max(1000),
  w: z.number().int().min(1).max(12),
  h: z.number().int().min(1).max(12),
}).strict().superRefine((layout, context) => {
  if (layout.x + layout.w > 12) context.addIssue({ code: "custom", path: ["w"], message: "Widget layout exceeds the 12-column grid" });
});

const visualizationSchema = z.object({
  id: identifier,
  type: z.enum(visualizationTypes),
  title: z.string().min(1).max(200),
  description: z.string().max(500).nullable(),
  dimension: fieldName.nullable(),
  measure: identifier.nullable(),
  secondaryMeasure: identifier.nullable(),
  aggregation: z.enum(aggregationTypes).nullable(),
  stackBy: fieldName.nullable(),
  columns: z.array(fieldName).max(30),
  limit: z.number().int().min(1).max(500),
  timeGrain: z.enum(timeGrains).default("AUTO"),
  sort: z.enum(sortModes).default("VALUE_DESC"),
  topN: z.number().int().min(1).max(100).default(10),
  showOther: z.boolean().default(true),
  formatOverride: z.enum(["AUTO", "NUMBER", "CURRENCY", "PERCENTAGE"]).default("AUTO"),
  layout: layoutSchema,
  visible: z.boolean(),
}).strict();

const evidenceSchema = z.object({
  kind: z.enum(["PROFILE_STAT", "SEMANTIC_FIELD", "QUERY_REQUIRED", "QUERY_RESULT"]),
  field: fieldName.nullable(),
  metric: z.string().min(1).max(120),
  value: z.union([z.string(), z.number(), z.boolean()]).nullable(),
}).strict();

const insightSchema = z.object({
  id: identifier,
  title: z.string().min(1).max(200),
  content: z.string().min(5).max(1000),
  evidence: z.array(evidenceSchema).min(1).max(10),
  confidence: z.number().min(0).max(1).nullable(),
}).strict();

export function createDashboardSpecificationSchema(input: { semanticModel: AnalyticsSemanticModel; allFields: string[] }) {
  const allFields = new Set(input.allFields);
  const dateFields = new Set(input.semanticModel.dateFields.map((item) => item.field));
  const dimensions = new Set([...input.semanticModel.dimensions.map((item) => item.field), ...dateFields]);
  const measures = new Set([...input.semanticModel.measures.map((item) => item.id), ...input.semanticModel.calculatedMetrics.map((item) => item.id)]);
  return z.object({
    schemaVersion: z.literal(1),
    title: z.string().min(2).max(160),
    description: z.string().min(5).max(1500),
    filters: z.array(filterSchema).max(12),
    visualizations: z.array(visualizationSchema).min(1).max(20),
    insights: z.array(insightSchema).max(8),
  }).strict().superRefine((specification, context) => {
    const widgetIds = specification.visualizations.map((item) => item.id);
    if (new Set(widgetIds).size !== widgetIds.length) context.addIssue({ code: "custom", path: ["visualizations"], message: "Visualization IDs must be unique" });
    const filterIds = specification.filters.map((item) => item.id);
    if (new Set(filterIds).size !== filterIds.length) context.addIssue({ code: "custom", path: ["filters"], message: "Filter IDs must be unique" });
    specification.filters.forEach((filter, index) => {
      if (!allFields.has(filter.field)) context.addIssue({ code: "custom", path: ["filters", index, "field"], message: `Unknown filter field: ${filter.field}` });
    });
    specification.visualizations.forEach((item, index) => {
      const path = ["visualizations", index] as Array<string | number>;
      const chart = !["KPI", "TABLE"].includes(item.type);
      if (chart && (!item.dimension || !dimensions.has(item.dimension))) context.addIssue({ code: "custom", path: [...path, "dimension"], message: `${item.type} requires a semantic dimension/date field` });
      if (item.dimension && !allFields.has(item.dimension)) context.addIssue({ code: "custom", path: [...path, "dimension"], message: `Unknown dimension: ${item.dimension}` });
      if (item.type !== "TABLE" && (!item.measure || !measures.has(item.measure))) context.addIssue({ code: "custom", path: [...path, "measure"], message: `${item.type} requires a semantic measure` });
      if (item.type === "SCATTER" && (!item.secondaryMeasure || !measures.has(item.secondaryMeasure))) context.addIssue({ code: "custom", path: [...path, "secondaryMeasure"], message: "SCATTER requires a secondary measure" });
      if (item.type === "TABLE") {
        if (!item.columns.length) context.addIssue({ code: "custom", path: [...path, "columns"], message: "TABLE requires at least one column" });
        item.columns.forEach((field, columnIndex) => {
          if (!allFields.has(field)) context.addIssue({ code: "custom", path: [...path, "columns", columnIndex], message: `Unknown table field: ${field}` });
        });
      }
      if (item.stackBy && (!dimensions.has(item.stackBy) || item.stackBy === item.dimension)) context.addIssue({ code: "custom", path: [...path, "stackBy"], message: `Invalid stack dimension: ${item.stackBy}` });
      if (["LINE", "AREA", "STACKED_AREA"].includes(item.type) && item.dimension && !dateFields.has(item.dimension)) context.addIssue({ code: "custom", path: [...path, "type"], message: `${item.type} requires a date dimension` });
      if (item.timeGrain !== "AUTO" && item.dimension && !dateFields.has(item.dimension)) context.addIssue({ code: "custom", path: [...path, "timeGrain"], message: "Time grain requires a date dimension" });
    });
  });
}

export type AnalyticsDashboardSpecification = z.infer<ReturnType<typeof createDashboardSpecificationSchema>>;
