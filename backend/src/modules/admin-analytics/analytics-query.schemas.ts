import { z } from "zod";
import { aggregationTypes, sortModes, timeGrains } from "./analytics-dashboard.schemas.js";

export const analyticsFieldSchema = z.string().min(1).max(255).regex(/^[\p{L}\p{N}_]+$/u);
const primitive = z.union([z.string().max(500), z.number().finite(), z.boolean()]);

export const analyticsFilterValueSchema = z.object({
  field: analyticsFieldSchema,
  type: z.enum(["SELECT", "MULTI_SELECT", "DATE_RANGE", "NUMERIC_RANGE", "BOOLEAN", "SEARCH"]),
  value: primitive.optional(),
  values: z.array(primitive).min(1).max(200).optional(),
  from: z.union([z.string().max(100), z.number().finite()]).optional(),
  to: z.union([z.string().max(100), z.number().finite()]).optional(),
}).strict().superRefine((filter, context) => {
  if (["SELECT", "BOOLEAN", "SEARCH"].includes(filter.type) && filter.value === undefined) context.addIssue({ code: "custom", path: ["value"], message: `${filter.type} requires value` });
  if (filter.type === "MULTI_SELECT" && !filter.values?.length) context.addIssue({ code: "custom", path: ["values"], message: "MULTI_SELECT requires values" });
  if (["DATE_RANGE", "NUMERIC_RANGE"].includes(filter.type) && filter.from === undefined && filter.to === undefined) context.addIssue({ code: "custom", path: ["from"], message: `${filter.type} requires from or to` });
});

export const analyticsQuerySchema = z.object({
  mode: z.enum(["AGGREGATE", "TABLE", "HISTOGRAM", "CORRELATION"]).default("AGGREGATE"),
  dimension: analyticsFieldSchema.nullable().optional(),
  measure: z.string().min(1).max(120).nullable().optional(),
  secondaryMeasure: z.string().min(1).max(120).nullable().optional(),
  stackBy: analyticsFieldSchema.nullable().optional(),
  aggregation: z.enum(aggregationTypes).nullable().optional(),
  fields: z.array(analyticsFieldSchema).max(30).optional(),
  filters: z.array(analyticsFilterValueSchema).max(20).default([]),
  limit: z.number().int().min(1).max(500).default(50),
  topN: z.number().int().min(1).max(100).default(10),
  showOther: z.boolean().default(true),
  timeGrain: z.enum(timeGrains).default("AUTO"),
  sort: z.enum(sortModes).default("VALUE_DESC"),
  bins: z.number().int().min(4).max(50).default(12),
  minGroupSize: z.number().int().min(1).max(10_000).default(1),
  page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25),
}).strict().superRefine((query, context) => {
  if (["AGGREGATE", "HISTOGRAM", "CORRELATION"].includes(query.mode) && !query.measure) context.addIssue({ code: "custom", path: ["measure"], message: `${query.mode} query requires a measure` });
  if (query.mode === "TABLE" && !query.fields?.length) context.addIssue({ code: "custom", path: ["fields"], message: "Table query requires fields" });
  if (query.mode === "CORRELATION" && !query.secondaryMeasure) context.addIssue({ code: "custom", path: ["secondaryMeasure"], message: "Correlation requires a secondary measure" });
});

export const analyticsBatchQuerySchema = z.object({
  widgetKeys: z.array(z.string().min(1).max(120)).min(1).max(20).optional(),
  filters: z.array(analyticsFilterValueSchema).max(20).default([]),
}).strict();

export const analyticsFilterOptionsSchema = z.object({
  field: analyticsFieldSchema,
  search: z.string().max(120).default(""),
  limit: z.number().int().min(1).max(100).default(50),
  filters: z.array(analyticsFilterValueSchema).max(20).default([]),
}).strict();

export const analyticsExportSchema = z.object({
  fields: z.array(analyticsFieldSchema).min(1).max(50),
  filters: z.array(analyticsFilterValueSchema).max(20).default([]),
  limit: z.number().int().min(1).max(50_000).default(10_000),
}).strict();

export type AnalyticsQueryInput = z.infer<typeof analyticsQuerySchema>;
export type AnalyticsFilterValue = z.infer<typeof analyticsFilterValueSchema>;
