import { prisma } from "../src/database/prisma.js";
import { analyticsFilterOptions, batchVisualizationQuery, executeAnalyticsQuery, exportAnalyticsRows, queryBackedInsights } from "../src/modules/admin-analytics/analytics-query.service.js";

const dashboard = await prisma.analyticsDashboard.findFirstOrThrow({ where: { dataset: { name: "BatFIN Portfolio Summary July 2026" }, deletedAt: null }, include: { dataset: true, currentVersion: true } });
const specification = dashboard.currentVersion!.specification as Record<string, unknown>;
const visualizations = Array.isArray(specification.visualizations) ? specification.visualizations : [];
console.log(JSON.stringify({ dashboardId: dashboard.id, version: dashboard.currentVersion!.version, rows: dashboard.dataset.rowCount, widgetCount: visualizations.length }, null, 2));
const checks = {
  deployment: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", dimension: "deployment_state", measure: "contracted_demand_rs", filters: [], topN: 10, limit: 50, showOther: true }),
  trend: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", dimension: "disburse_date", measure: "contracted_demand_rs", filters: [], timeGrain: "MONTH", sort: "TIME_ASC", limit: 100 }),
  dealerRisk: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", dimension: "dealer", measure: "delinquent_1_0", filters: [], topN: 10, limit: 50, showOther: true }),
  dealerHomeState: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", dimension: "dealer_home_state", measure: "contracted_demand_rs", filters: [], topN: 10, limit: 50, showOther: true }),
  caseStatus: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", dimension: "case_status", measure: "row_count", filters: [], topN: 10, limit: 50, showOther: false }),
  bucket: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", dimension: "bucket", measure: "row_count", filters: [], topN: 10, limit: 50, showOther: false }),
  contractedDemand: await executeAnalyticsQuery(dashboard.id, dashboard.ownerAdminId, { mode: "AGGREGATE", measure: "contracted_demand_rs", filters: [] }),
};
for (const [name, result] of Object.entries(checks)) console.log(`${name}: ${JSON.stringify(result)}`);
const batch = await batchVisualizationQuery(dashboard.id, dashboard.ownerAdminId, { filters: [] });
const errors = Object.entries(batch.widgets).filter(([, value]) => value.error);
console.log(`batch: ${Object.keys(batch.widgets).length} widgets, ${errors.length} errors`);
console.log(`filter options: ${JSON.stringify(await analyticsFilterOptions(dashboard.id, dashboard.ownerAdminId, { field: "dealer", search: "auto", limit: 10, filters: [] }))}`);
console.log(`insights: ${JSON.stringify(await queryBackedInsights(dashboard.id, dashboard.ownerAdminId, []))}`);
console.log(`export rows: ${(await exportAnalyticsRows(dashboard.id, dashboard.ownerAdminId, { fields: ["dealer", "deployment_state", "contracted_demand_rs"], filters: [], limit: 5 })).rowCount}`);
await prisma.$disconnect();
