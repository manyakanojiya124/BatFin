import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminAnalyticsService } from "./admin-analytics.service.js";
import * as dashboardService from "./analytics-dashboard-management.service.js";
import { askAnalyticsData } from "./analytics-ask.service.js";
import {
  analyticsFilterOptions,
  batchVisualizationQuery,
  executeAnalyticsQuery,
  exportAnalyticsRows,
  queryBackedInsights,
  visualizationQuery,
} from "./analytics-query.service.js";

function auth(request: Request) {
  if (!request.adminAuth) {
    throw new ApiError(
      401,
      "Admin authentication is required",
      "ADMIN_UNAUTHORIZED",
    );
  }
  return request.adminAuth;
}

function context(request: Request) {
  return {
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
  };
}

function pathId(
  value: string | string[] | undefined,
  label = "Dataset ID",
) {
  if (typeof value !== "string" || !value) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

const aiStatus: RequestHandler = (_request, response) => {
  response.status(200).json({
    data: { ai: adminAnalyticsService.aiStatus() },
  });
};

const upload: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.upload(
    admin.adminUserId,
    request.file,
    request.body ?? {},
    context(request),
  );
  response.status(202).json({ data: result });
};

const list: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.list(admin.adminUserId, {
    q: request.query.q,
    status: request.query.status,
    page: request.query.page,
    pageSize: request.query.pageSize,
  });
  response.status(200).json({ data: result });
};

const getById: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const dataset = await adminAnalyticsService.getById(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: { dataset } });
};

const status: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.status(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: result });
};

const sheets: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.listSheets(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: result });
};

const selectSheet: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.selectSheet(
    pathId(request.params.id),
    pathId(request.params.sheetId, "Worksheet ID"),
    admin.adminUserId,
    context(request),
  );
  response.status(202).json({ data: result });
};

const preview: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.preview(
    pathId(request.params.id),
    admin.adminUserId,
    { page: request.query.page, pageSize: request.query.pageSize },
  );
  response.status(200).json({ data: result });
};

const profile: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.getProfile(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: result });
};

const updateMetadata: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const dataset = await adminAnalyticsService.updateMetadata(
    pathId(request.params.id),
    admin.adminUserId,
    request.body ?? {},
    context(request),
  );
  response.status(200).json({ data: { dataset } });
};

const history: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.history(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: result });
};

const verifySource: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.verifySourceIntegrity(
    pathId(request.params.id),
    admin.adminUserId,
    context(request),
  );
  response.status(200).json({ data: result });
};

const analysisContext: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.analysisContext(
    pathId(request.params.id),
    admin.adminUserId,
    context(request),
  );
  response.status(200).json({ data: result });
};

const refreshSource: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.refreshSource(
    pathId(request.params.id),
    admin.adminUserId,
    request.file,
    context(request),
  );
  response.status(202).json({ data: result });
};

const analyze: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.requestSemanticAnalysis(
    pathId(request.params.id),
    admin.adminUserId,
    context(request),
  );
  response.status(202).json({ data: result });
};

const semanticModel: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.getCurrentSemanticModel(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: result });
};

const semanticModels: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.listSemanticModels(
    pathId(request.params.id),
    admin.adminUserId,
  );
  response.status(200).json({ data: result });
};

const retryParsing: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.retryParsing(
    pathId(request.params.id),
    admin.adminUserId,
    context(request),
  );
  response.status(202).json({ data: result });
};

const listDashboards: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await dashboardService.listDashboards(admin.adminUserId, request.query) });
};
const getDashboard: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await dashboardService.getDashboard(pathId(request.params.id, "Dashboard ID"), admin.adminUserId) });
};
const saveDashboard: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await dashboardService.saveDashboard(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body ?? {}, context(request)) });
};
const duplicateDashboard: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(201).json({ data: await dashboardService.duplicateDashboard(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, context(request)) });
};
const deleteDashboard: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await dashboardService.deleteDashboard(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body?.reason, context(request)) });
};
const regenerateDashboard: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(202).json({ data: await dashboardService.requestRegeneration(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, context(request)) });
};
const queryDashboard: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await executeAnalyticsQuery(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body ?? {}) });
};
const queryVisualization: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await visualizationQuery(pathId(request.params.id, "Dashboard ID"), pathId(request.params.widgetKey, "Widget key"), admin.adminUserId, request.body ?? {}) });
};
const queryVisualizationsBatch: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await batchVisualizationQuery(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body ?? {}) });
};
const filterOptions: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await analyticsFilterOptions(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body ?? {}) });
};
const askData: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await askAnalyticsData(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body ?? {}) });
};
const evidenceInsights: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: await queryBackedInsights(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body?.filters ?? []) });
};
const exportRows: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await exportAnalyticsRows(pathId(request.params.id, "Dashboard ID"), admin.adminUserId, request.body ?? {});
  response.setHeader("content-type", "text/csv; charset=utf-8");
  response.setHeader("content-disposition", `attachment; filename="${result.fileName}"`);
  response.setHeader("x-exported-row-count", String(result.rowCount));
  response.status(200).send(result.csv);
};

const remove: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.remove(
    pathId(request.params.id),
    admin.adminUserId,
    request.body?.reason,
    context(request),
  );
  response.status(200).json({ data: result });
};

const purge: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminAnalyticsService.purge(
    pathId(request.params.id),
    admin.adminUserId,
    request.body?.reason,
    context(request),
  );
  response.status(200).json({ data: result });
};

export const adminAnalyticsController = {
  aiStatus,
  upload,
  list,
  getById,
  status,
  sheets,
  selectSheet,
  preview,
  profile,
  updateMetadata,
  history,
  verifySource,
  analysisContext,
  refreshSource,
  analyze,
  semanticModel,
  semanticModels,
  retryParsing,
  listDashboards,
  getDashboard,
  saveDashboard,
  duplicateDashboard,
  deleteDashboard,
  regenerateDashboard,
  queryDashboard,
  queryVisualization,
  queryVisualizationsBatch,
  filterOptions,
  askData,
  evidenceInsights,
  exportRows,
  remove,
  purge,
};
