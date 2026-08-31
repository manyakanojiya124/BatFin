import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminMasterDataService } from "./admin-master-data.service.js";

function auth(request: Request) {
  if (!request.adminAuth) throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  return request.adminAuth;
}
function context(request: Request) {
  return { ipAddress: request.ip || null, userAgent: request.header("user-agent")?.slice(0, 500) ?? null };
}
function pathValue(value: string | string[] | undefined, label: string) {
  if (typeof value !== "string" || !value) throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  return value;
}

const catalog: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: { datasets: await adminMasterDataService.catalog() } });
};
const summary: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: { summary: await adminMasterDataService.summary() } });
};
const records: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await adminMasterDataService.listRecords(pathValue(request.params.datasetType, "Dataset type"), { q: request.query.q, active: request.query.active, page: request.query.page, pageSize: request.query.pageSize }) });
};
const history: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await adminMasterDataService.history(pathValue(request.params.datasetType, "Dataset type"), pathValue(request.params.businessKey, "Business key")) });
};
const imports: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await adminMasterDataService.listImports({ datasetType: request.query.datasetType, status: request.query.status, page: request.query.page, pageSize: request.query.pageSize }) });
};
const validate: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({ data: { validation: await adminMasterDataService.validate(pathValue(request.params.datasetType, "Dataset type"), request.file, admin.adminUserId, context(request)) } });
};
const importFile: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const job = await adminMasterDataService.importFile(pathValue(request.params.datasetType, "Dataset type"), request.file, request.body?.reason, admin.adminUserId, context(request));
  response.status(201).json({ data: { job } });
};
const exportCsv: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const datasetType = pathValue(request.params.datasetType, "Dataset type");
  const csv = await adminMasterDataService.exportCsv(datasetType, admin.adminUserId, context(request));
  response.status(200).type("text/csv; charset=utf-8").setHeader("Content-Disposition", `attachment; filename="batfin-${datasetType}-${new Date().toISOString().slice(0, 10)}.csv"`).send(csv);
};

export const adminMasterDataController = { catalog, summary, records, history, imports, validate, importFile, exportCsv };
