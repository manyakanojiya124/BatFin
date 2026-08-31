import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminAuditService } from "./admin-audit.service.js";

function auth(request: Request) {
  if (!request.adminAuth) {
    throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  }
  return request.adminAuth;
}

function context(request: Request) {
  return {
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
  };
}

function query(request: Request) {
  return {
    q: request.query.q,
    action: request.query.action,
    resourceType: request.query.resourceType,
    adminUserId: request.query.adminUserId,
    success: request.query.success,
    dateFrom: request.query.dateFrom,
    dateTo: request.query.dateTo,
    page: request.query.page,
    pageSize: request.query.pageSize,
  };
}

const list: RequestHandler = async (request, response) => {
  response.status(200).json({ data: await adminAuditService.list(query(request)) });
};

const summary: RequestHandler = async (_request, response) => {
  response.status(200).json({
    data: { summary: await adminAuditService.getSummary() },
  });
};

const facets: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await adminAuditService.getFacets() });
};

const exportCsv: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const csv = await adminAuditService.exportCsv(
    query(request),
    admin.adminUserId,
    context(request),
  );
  response
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="batfin-admin-audit-${new Date().toISOString().slice(0, 10)}.csv"`,
    )
    .send(csv);
};

export const adminAuditController = { list, summary, facets, exportCsv };
