import { z } from "zod";

export interface SemanticFieldDefinition {
  field: string;
  dataType: string;
}

const semanticFieldName = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[\p{L}\p{N}_]+$/u);
const identifier = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[a-z][a-z0-9_]*$/);
const confidence = z.number().finite().min(0).max(1).default(0.8);

const semanticIdentifierSchema = z
  .object({
    field: semanticFieldName,
    label: z.string().min(1).max(200),
    description: z.string().min(1).max(500),
    confidence,
  })
  .strict();

const semanticDimensionSchema = z
  .object({
    field: semanticFieldName,
    label: z.string().min(1).max(200),
    kind: z.enum(["CATEGORY", "BOOLEAN", "NUMERIC", "TEXT"]),
    role: z
      .enum(["CATEGORY", "STATUS", "GEOGRAPHY", "ENTITY", "RISK", "SEGMENT"])
      .default("CATEGORY"),
    description: z.string().min(1).max(500),
    confidence,
  })
  .strict();

const semanticMeasureSchema = z
  .object({
    id: identifier,
    field: semanticFieldName.nullable(),
    label: z.string().min(1).max(200),
    kind: z.enum(["FIELD", "ROW_COUNT"]),
    aggregation: z.enum(["SUM", "AVG", "MIN", "MAX", "COUNT"]),
    format: z.enum(["NUMBER", "CURRENCY", "PERCENTAGE"]),
    currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).nullable().default(null),
    unit: z.string().min(1).max(40).nullable().default(null),
    role: z
      .enum(["COUNT", "VALUE", "CURRENCY", "RATE", "RISK", "QUANTITY", "DURATION"])
      .default("VALUE"),
    additive: z.boolean().default(true),
    description: z.string().min(1).max(500),
    confidence,
  })
  .strict()
  .superRefine((measure, context) => {
    if (measure.kind === "ROW_COUNT" && measure.field !== null) {
      context.addIssue({ code: "custom", path: ["field"], message: "ROW_COUNT measure field must be null" });
    }
    if (measure.kind === "FIELD" && measure.field === null) {
      context.addIssue({ code: "custom", path: ["field"], message: "FIELD measure requires a field" });
    }
    if (measure.format === "CURRENCY" && !measure.currencyCode) {
      context.addIssue({ code: "custom", path: ["currencyCode"], message: "Currency measures require an ISO currency code" });
    }
    if (measure.format !== "CURRENCY" && measure.currencyCode) {
      context.addIssue({ code: "custom", path: ["currencyCode"], message: "Only currency measures may define currencyCode" });
    }
  });

const semanticDateFieldSchema = z
  .object({
    field: semanticFieldName,
    label: z.string().min(1).max(200),
    type: z.enum(["DATE", "DATETIME"]),
    defaultGrain: z.enum(["DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]).default("MONTH"),
    description: z.string().min(1).max(500),
    confidence,
  })
  .strict();

const semanticFilterSchema = z
  .object({
    field: semanticFieldName,
    label: z.string().min(1).max(200),
    type: z.enum(["SELECT", "MULTI_SELECT", "DATE_RANGE", "NUMERIC_RANGE", "BOOLEAN", "SEARCH"]),
  })
  .strict();

const semanticCalculatedMetricSchema = z
  .object({
    id: identifier,
    label: z.string().min(1).max(200),
    operation: z.enum(["RATIO", "PERCENTAGE", "DIFFERENCE"]),
    numeratorField: semanticFieldName,
    denominatorField: semanticFieldName,
    multiplier: z.number().finite().min(0.000001).max(1_000_000),
    format: z.enum(["NUMBER", "CURRENCY", "PERCENTAGE"]),
    currencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).nullable().default(null),
    unit: z.string().min(1).max(40).nullable().default(null),
    role: z.enum(["VALUE", "CURRENCY", "RATE", "RISK"]).default("RATE"),
    description: z.string().min(1).max(500),
    confidence,
  })
  .strict();

export function createSemanticModelSchema(fields: SemanticFieldDefinition[]) {
  const fieldTypes = new Map(fields.map((field) => [field.field, field.dataType]));
  const numericFields = new Set(fields.filter((field) => ["INTEGER", "DECIMAL"].includes(field.dataType)).map((field) => field.field));
  const dateFields = new Set(fields.filter((field) => ["DATE", "DATETIME"].includes(field.dataType)).map((field) => field.field));

  return z
    .object({
      schemaVersion: z.literal(1),
      title: z.string().min(2).max(160),
      datasetSummary: z.string().min(10).max(1500),
      businessDomain: z.string().min(2).max(120),
      domainKey: z.enum(["generic", "finance", "sales", "hr", "inventory", "batfin"]).default("generic"),
      defaultCurrencyCode: z.string().length(3).regex(/^[A-Z]{3}$/).nullable().default(null),
      identifiers: z.array(semanticIdentifierSchema).max(30),
      dimensions: z.array(semanticDimensionSchema).max(35),
      measures: z.array(semanticMeasureSchema).min(1).max(35),
      dateFields: z.array(semanticDateFieldSchema).max(20),
      suggestedFilters: z.array(semanticFilterSchema).max(20),
      calculatedMetrics: z.array(semanticCalculatedMetricSchema).max(10),
    })
    .strict()
    .superRefine((model, context) => {
      const roleFields = new Map<string, string>();
      const register = (field: string, role: string, path: Array<string | number>) => {
        if (!fieldTypes.has(field)) {
          context.addIssue({ code: "custom", path, message: `Unknown dataset field: ${field}` });
          return;
        }
        const previous = roleFields.get(field);
        if (previous && previous !== role) {
          context.addIssue({ code: "custom", path, message: `${field} is assigned to both ${previous} and ${role}` });
        } else {
          roleFields.set(field, role);
        }
      };
      model.identifiers.forEach((item, index) => register(item.field, "IDENTIFIER", ["identifiers", index, "field"]));
      model.dimensions.forEach((item, index) => register(item.field, "DIMENSION", ["dimensions", index, "field"]));
      model.dateFields.forEach((item, index) => {
        register(item.field, "DATE", ["dateFields", index, "field"]);
        if (!dateFields.has(item.field)) context.addIssue({ code: "custom", path: ["dateFields", index, "field"], message: `${item.field} is not a physical date/datetime column` });
      });
      model.measures.forEach((item, index) => {
        if (item.kind === "FIELD" && item.field) {
          register(item.field, "MEASURE", ["measures", index, "field"]);
          if (!numericFields.has(item.field)) context.addIssue({ code: "custom", path: ["measures", index, "field"], message: `${item.field} is not a numeric column` });
        }
      });
      model.suggestedFilters.forEach((item, index) => {
        if (!fieldTypes.has(item.field)) context.addIssue({ code: "custom", path: ["suggestedFilters", index, "field"], message: `Unknown filter field: ${item.field}` });
      });
      model.calculatedMetrics.forEach((item, index) => {
        for (const [key, field] of [["numeratorField", item.numeratorField], ["denominatorField", item.denominatorField]] as const) {
          if (!numericFields.has(field)) context.addIssue({ code: "custom", path: ["calculatedMetrics", index, key], message: `${field} is not a numeric column` });
        }
        if (item.format === "CURRENCY" && !item.currencyCode) context.addIssue({ code: "custom", path: ["calculatedMetrics", index, "currencyCode"], message: "Currency metrics require currencyCode" });
      });
      const ids = [...model.measures.map((item) => item.id), ...model.calculatedMetrics.map((item) => item.id)];
      if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", path: ["measures"], message: "Measure and calculated metric IDs must be unique" });
    });
}

export type AnalyticsSemanticModel = z.infer<ReturnType<typeof createSemanticModelSchema>>;
