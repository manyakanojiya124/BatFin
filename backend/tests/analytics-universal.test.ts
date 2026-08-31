import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parse } from "csv-parse/sync";
import { createDeterministicDashboardSpecification } from "../src/modules/admin-analytics/analytics-dashboard-fallback.service.js";
import { reconcileDashboardSpecification } from "../src/modules/admin-analytics/analytics-dashboard-reconciler.service.js";
import { createDashboardSpecificationSchema } from "../src/modules/admin-analytics/analytics-dashboard.schemas.js";
import { detectAnalyticsDomain } from "../src/modules/admin-analytics/analytics-domain-registry.js";
import { detectHeaderRow } from "../src/modules/admin-analytics/analytics-header-detection.service.js";
import { normalizeAnalyticsSheet } from "../src/modules/admin-analytics/analytics-normalization.service.js";
import { createDeterministicSemanticModel } from "../src/modules/admin-analytics/analytics-semantic-fallback.service.js";

function portfolioContext() {
  const csv = readFileSync(new URL("./fixtures/BatFIN_Portfolio_Summary_July26_Final.csv", import.meta.url), "utf8");
  const matrix = parse(csv, { bom: true, relax_column_count: true, skip_empty_lines: false }) as unknown[][];
  const header = detectHeaderRow(matrix)!;
  const normalized = normalizeAnalyticsSheet(matrix, header);
  const columns = normalized.columns.map((column) => {
    const values = normalized.rows.map((row) => row.data[column.normalizedName]);
    const populated = values.filter((value) => value !== null);
    return {
      field: column.normalizedName,
      label: column.displayName,
      dataType: column.dataType,
      uniqueCount: new Set(populated.map((value) => `${typeof value}:${String(value)}`)).size,
      nullPercentage: values.length ? ((values.length - populated.length) / values.length) * 100 : 0,
      cardinalityRatio: values.length ? new Set(populated.map(String)).size / values.length : 0,
      sensitiveSamplesExcluded: /customer_name|customer_loan_id|battery_no/.test(column.normalizedName),
      sampleValues: populated.slice(0, 5),
      topValues: [],
    };
  });
  return {
    normalized,
    context: {
      dataset: { name: "BatFIN Portfolio Summary July 2026", rowCount: normalized.rowCount, columnCount: normalized.columnCount, completenessPercentage: 90, duplicateRowCount: 0 },
      columns,
    },
  };
}

test("portfolio regression fixture detects headers and excludes aggregate summary rows", () => {
  const { normalized } = portfolioContext();
  assert.equal(normalized.columns.length, 20);
  assert.equal(normalized.rowCount, 664);
  assert.equal(normalized.excludedSummaryRowCount, 1);
  assert.equal(normalized.columns.find((column) => column.normalizedName === "disburse_date")?.dataType, "DATE");
  assert.ok(["INTEGER", "DECIMAL"].includes(normalized.columns.find((column) => column.normalizedName === "billed_to_date_rs")?.dataType ?? ""));
  assert.deepEqual(normalized.columns.map((column) => column.normalizedName).slice(4, 9), ["dealer", "dealer_home_state", "deployment_state", "case_status", "bucket"]);
});

test("portfolio semantic model detects currency, risk rates and useful dimensions", () => {
  const { context } = portfolioContext();
  const semantic = createDeterministicSemanticModel(context);
  assert.equal(semantic.domainKey, "batfin");
  assert.equal(semantic.defaultCurrencyCode, "INR");
  assert.equal(semantic.measures.find((measure) => measure.id === "contracted_demand_rs")?.format, "CURRENCY");
  assert.equal(semantic.measures.find((measure) => measure.id === "delinquent_1_0")?.format, "PERCENTAGE");
  assert.ok(semantic.dimensions.some((dimension) => dimension.field === "deployment_state"));
  assert.ok(semantic.dimensions.some((dimension) => dimension.field === "dealer"));
});

test("dashboard reconciler canonicalizes title, configuration and chart compatibility", () => {
  const { context, normalized } = portfolioContext();
  const semantic = createDeterministicSemanticModel(context);
  const fallback = createDeterministicDashboardSpecification(semantic, context);
  const target = fallback.visualizations.find((item) => item.dimension === "deployment_state" && item.measure === "contracted_demand_rs")
    ?? fallback.visualizations.find((item) => item.dimension === "deployment_state")!;
  const bad = { ...fallback, visualizations: fallback.visualizations.map((item) => item.id === target.id ? { ...item, title: "Wrong metric by wrong field" } : item) };
  const reconciled = reconcileDashboardSpecification({ specification: bad, semantic, context }).specification;
  const corrected = reconciled.visualizations.find((item) => item.id === target.id)!;
  const measureLabel = semantic.measures.find((item) => item.id === corrected.measure)?.label;
  assert.equal(corrected.title, `${measureLabel} by Deployment State`);
  const schema = createDashboardSpecificationSchema({ semanticModel: semantic, allFields: normalized.columns.map((column) => column.normalizedName) });
  assert.equal(schema.safeParse(reconciled).success, true);
});

test("count-like overdue fields are not misclassified as currency", () => {
  const semantic = createDeterministicSemanticModel({
    dataset: { name: "Collections", rowCount: 20, columnCount: 2, completenessPercentage: 100, duplicateRowCount: 0 },
    columns: [
      { field: "total_overdue_installments", label: "Total Overdue Installments", dataType: "INTEGER", uniqueCount: 6, nullPercentage: 0, cardinalityRatio: 0.3, sensitiveSamplesExcluded: false, sampleValues: [0, 1, 2] },
      { field: "overdue_amount_rs", label: "Overdue Amount (Rs)", dataType: "DECIMAL", uniqueCount: 10, nullPercentage: 0, cardinalityRatio: 0.5, sensitiveSamplesExcluded: false, sampleValues: [100, 200] },
    ],
  });
  assert.equal(semantic.measures.find((measure) => measure.id === "total_overdue_installments")?.format, "NUMBER");
  assert.equal(semantic.measures.find((measure) => measure.id === "overdue_amount_rs")?.format, "CURRENCY");
});

test("domain registry remains dataset agnostic across common business fixtures", () => {
  assert.equal(detectAnalyticsDomain(["order_date", "product", "revenue", "channel"]).key, "sales");
  assert.equal(detectAnalyticsDomain(["employee_id", "department", "salary", "attrition"]).key, "hr");
  assert.equal(detectAnalyticsDomain(["sku", "warehouse", "stock_status", "quantity"]).key, "inventory");
  assert.equal(detectAnalyticsDomain(["invoice_date", "cost_center", "receivable", "expense"]).key, "finance");
});
