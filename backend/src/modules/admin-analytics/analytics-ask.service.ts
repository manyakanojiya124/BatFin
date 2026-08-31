import { z } from "zod";
import { ApiError } from "../../middleware/error.middleware.js";
import { analyticsAIService } from "./analytics-ai.service.js";
import { detectAnalyticsDomain, matchesAny } from "./analytics-domain-registry.js";
import { analyticsFilterValueSchema } from "./analytics-query.schemas.js";
import { executeAnalyticsQuery, loadDashboardQueryContext } from "./analytics-query.service.js";

const askInputSchema = z.object({
  question: z.string().trim().min(3).max(500),
  filters: z.array(analyticsFilterValueSchema).max(20).default([]),
}).strict();
const intentSchema = z.object({
  intent: z.enum(["RANK", "TREND", "BREAKDOWN", "SUMMARY"]),
  dimension: z.string().min(1).max(255).nullable(),
  measure: z.string().min(1).max(120),
  aggregation: z.enum(["SUM", "AVG", "MIN", "MAX", "COUNT"]),
  timeGrain: z.enum(["AUTO", "DAY", "WEEK", "MONTH", "QUARTER", "YEAR"]),
  topN: z.number().int().min(1).max(25),
  rationale: z.string().min(5).max(300),
}).strict();
const answerSchema = z.object({
  summary: z.string().min(10).max(1000),
  bullets: z.array(z.string().min(3).max(400)).max(5),
  methodology: z.string().min(10).max(600),
  evidenceRefs: z.array(z.string().min(1).max(80)).min(1).max(20),
}).strict();

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}
function mentioned(question: string, label: string, field: string) {
  const q = normalize(question);
  return [normalize(label), normalize(field)].some((candidate) => candidate.length > 2 && q.includes(candidate));
}
function deterministicIntent(question: string, semantic: Awaited<ReturnType<typeof loadDashboardQueryContext>>["semantic"]) {
  const q = normalize(question);
  const plugin = detectAnalyticsDomain([
    ...semantic.dimensions.map((item) => item.field),
    ...semantic.measures.map((item) => item.field ?? item.id),
  ]);
  const riskQuestion = /risk|delinquen|npa|repo|overdue|default|bad/.test(q);
  const trendQuestion = /trend|over time|month|year|week|daily|monthly|growth/.test(q);
  const rankQuestion = /top|highest|lowest|best|worst|leading|rank|most|least|which|who/.test(q);
  const measure = semantic.measures.find((item) => mentioned(q, item.label, item.id))
    ?? (riskQuestion ? semantic.measures.find((item) => item.role === "RISK" || matchesAny(item.id, plugin.riskFields)) : null)
    ?? semantic.measures.find((item) => item.kind === "FIELD" && item.role === "CURRENCY")
    ?? semantic.measures.find((item) => item.kind === "FIELD")
    ?? semantic.measures[0]!;
  let dimension = semantic.dimensions.find((item) => mentioned(q, item.label, item.field)) ?? null;
  if (!dimension && rankQuestion) dimension = semantic.dimensions.find((item) => item.role === "ENTITY") ?? null;
  if (!dimension && /state|region|city|geograph|location/.test(q)) dimension = semantic.dimensions.find((item) => item.role === "GEOGRAPHY") ?? null;
  if (!dimension && /status|bucket|breakdown|distribution|split/.test(q)) dimension = semantic.dimensions.find((item) => item.role === "STATUS") ?? null;
  const date = semantic.dateFields.find((item) => mentioned(q, item.label, item.field)) ?? semantic.dateFields[0] ?? null;
  if (trendQuestion && date) {
    return { intent: "TREND" as const, dimension: date.field, measure: measure.id, aggregation: measure.aggregation, timeGrain: date.defaultGrain ?? "MONTH" as const, topN: 25, rationale: "The question requests a chronological trend." };
  }
  return {
    intent: rankQuestion && dimension ? "RANK" as const : dimension ? "BREAKDOWN" as const : "SUMMARY" as const,
    dimension: dimension?.field ?? null,
    measure: measure.id,
    aggregation: measure.aggregation,
    timeGrain: "AUTO" as const,
    topN: rankQuestion ? 10 : 15,
    rationale: dimension ? "Matched the requested business dimension and measure." : "No explicit dimension was requested, so a summary metric is used.",
  };
}
function evidenceFromResult(result: unknown) {
  if (!result || typeof result !== "object") return [];
  const value = result as Record<string, unknown>;
  if (value.mode !== "AGGREGATE" || !Array.isArray(value.rows)) return [];
  return value.rows.slice(0, 25).map((row, index) => {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    return {
      id: `result_${index + 1}`,
      dimension: item.dimension ?? null,
      value: item.value ?? null,
      rowCount: item.rowCount ?? 0,
    };
  });
}
function fallbackAnswer(question: string, intent: z.infer<typeof intentSchema>, evidence: ReturnType<typeof evidenceFromResult>, measure: { label: string; format: string; currencyCode?: string | null; unit?: string | null }) {
  const formatted = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value)) return "not available";
    if (measure.format === "PERCENTAGE") return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(Math.abs(value) <= 1 ? value * 100 : value)}%`;
    if (measure.format === "CURRENCY") return new Intl.NumberFormat("en-IN", { style: "currency", currency: measure.currencyCode ?? "INR", maximumFractionDigits: 0 }).format(value);
    const output = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 }).format(value);
    return measure.unit ? `${output} ${measure.unit}` : output;
  };
  const first = evidence[0];
  const summary = intent.dimension && first?.dimension !== null
    ? `${String(first?.dimension ?? "The leading segment")} ranks first for ${measure.label} in the current filtered result.`
    : `The current filtered ${measure.label} result is ${formatted(first?.value)}.`;
  return {
    summary,
    bullets: evidence.slice(0, 3).map((item) => `${item.dimension ?? "Total"}: ${formatted(item.value)} across ${item.rowCount} matching records.`),
    methodology: `The question was mapped to a validated ${intent.intent.toLowerCase()} intent. PostgreSQL computed the result using ${intent.aggregation}; no AI-generated SQL or arithmetic was used.`,
    evidenceRefs: evidence.slice(0, Math.max(1, Math.min(5, evidence.length))).map((item) => item.id),
  };
}

export async function askAnalyticsData(dashboardId: string, adminUserId: string, rawInput: unknown) {
  const parsed = askInputSchema.safeParse(rawInput);
  if (!parsed.success) throw new ApiError(400, parsed.error.issues.map((issue) => issue.message).join("; "), "ANALYTICS_ASK_INVALID");
  const context = await loadDashboardQueryContext(dashboardId, adminUserId);
  const fallbackIntent = deterministicIntent(parsed.data.question, context.semantic);
  const intentResult = await analyticsAIService.generateStructured({
    operation: "analytics_question_intent",
    schemaName: "analytics_question_intent",
    schema: intentSchema,
    systemPrompt: "Map the question to the supplied semantic model. Return structured intent only. Never produce SQL, code, calculations, or fields not listed.",
    userPrompt: `Question: ${parsed.data.question}\nAllowed dimensions: ${JSON.stringify([...context.semantic.dimensions.map((item) => ({ field: item.field, label: item.label, role: item.role })), ...context.semantic.dateFields.map((item) => ({ field: item.field, label: item.label, role: "DATE" }))])}\nAllowed measures: ${JSON.stringify(context.semantic.measures.map((item) => ({ id: item.id, label: item.label, aggregation: item.aggregation, role: item.role })))}`,
    temperature: 0,
    maxOutputTokens: 700,
  }, () => fallbackIntent);
  const dimensions = new Set([...context.semantic.dimensions.map((item) => item.field), ...context.semantic.dateFields.map((item) => item.field)]);
  const measures = new Set(context.semantic.measures.map((item) => item.id));
  let intent = intentResult.value;
  if ((intent.dimension && !dimensions.has(intent.dimension)) || !measures.has(intent.measure)) intent = fallbackIntent;
  const measure = context.semantic.measures.find((item) => item.id === intent.measure)!;
  intent = { ...intent, aggregation: measure.aggregation };
  const result = await executeAnalyticsQuery(dashboardId, adminUserId, {
    mode: "AGGREGATE",
    dimension: intent.dimension,
    measure: intent.measure,
    aggregation: intent.aggregation,
    filters: parsed.data.filters,
    topN: intent.topN,
    limit: Math.max(intent.topN, 25),
    showOther: intent.intent !== "RANK",
    sort: intent.intent === "TREND" ? "TIME_ASC" : "VALUE_DESC",
    timeGrain: intent.timeGrain,
  });
  const evidence = evidenceFromResult(result);
  if (!evidence.length) throw new ApiError(422, "The question produced no query evidence for the current filters", "ANALYTICS_ASK_NO_EVIDENCE");
  const fallback = fallbackAnswer(parsed.data.question, intent, evidence, measure);
  const answerResult = await analyticsAIService.generateStructured({
    operation: "analytics_answer_explanation",
    schemaName: "analytics_answer_explanation",
    schema: answerSchema,
    systemPrompt: "Explain only the supplied deterministic evidence. Do not invent, recompute, round inconsistently, or cite evidence IDs that are not supplied. Keep methodology explicit.",
    userPrompt: `Question: ${parsed.data.question}\nValidated intent: ${JSON.stringify(intent)}\nMeasure metadata: ${JSON.stringify({ label: measure.label, format: measure.format, currencyCode: measure.currencyCode, unit: measure.unit })}\nDeterministic evidence: ${JSON.stringify(evidence)}`,
    temperature: 0.1,
    maxOutputTokens: 1000,
  }, () => fallback);
  const allowedEvidence = new Set(evidence.map((item) => item.id));
  const answer = answerResult.value.evidenceRefs.every((reference) => allowedEvidence.has(reference)) ? answerResult.value : fallback;
  return {
    question: parsed.data.question,
    intent,
    answer,
    evidence,
    chart: result,
    source: { intent: intentResult.source, explanation: answerResult.source, provider: answerResult.provider, model: answerResult.model },
  };
}
