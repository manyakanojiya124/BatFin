import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminPaymentsService } from "./admin-payments.service.js";

function adminContext(request: Request) {
  if (!request.adminAuth) {
    throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  }
  return request.adminAuth;
}

function requestContext(request: Request) {
  return {
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
  };
}

function pathValue(value: string | string[] | undefined, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

function financeQuery(request: Request) {
  return {
    q: request.query.q,
    status: request.query.status,
    type: request.query.type,
    direction: request.query.direction,
    method: request.query.method,
    dateFrom: request.query.dateFrom,
    dateTo: request.query.dateTo,
    page: request.query.page,
    pageSize: request.query.pageSize,
  };
}

const list: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await adminPaymentsService.list(financeQuery(request)),
  });
};

const summary: RequestHandler = async (_request, response) => {
  response.status(200).json({
    data: { summary: await adminPaymentsService.getSummary() },
  });
};

const getById: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const transaction = await adminPaymentsService.getById(
    pathValue(request.params.id, "Transaction ID"),
    context.adminUserId,
    requestContext(request),
  );
  response.status(200).json({ data: { transaction } });
};

const providerLookup: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const transaction = await adminPaymentsService.getByProviderReference(
    pathValue(request.params.reference, "Provider reference"),
    context.adminUserId,
    requestContext(request),
  );
  response.status(200).json({ data: { transaction } });
};

const exportCsv: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const csv = await adminPaymentsService.exportCsv(
    financeQuery(request),
    context.adminUserId,
    requestContext(request),
  );
  const date = new Date().toISOString().slice(0, 10);
  response
    .status(200)
    .type("text/csv; charset=utf-8")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="batfin-finance-${date}.csv"`,
    )
    .send(csv);
};

const createAdjustment: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminPaymentsService.createAdjustment(
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(201).json({ data: result });
};

const createRefund: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminPaymentsService.createRefund(
    pathValue(request.params.id, "Original payment ID"),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(201).json({ data: result });
};

export const adminPaymentsController = {
  list,
  summary,
  getById,
  providerLookup,
  exportCsv,
  createAdjustment,
  createRefund,
};
