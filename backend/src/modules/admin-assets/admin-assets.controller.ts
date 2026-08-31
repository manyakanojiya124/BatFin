import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminAssetsService } from "./admin-assets.service.js";

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

function pathId(value: string | string[] | undefined, label = "Asset ID") {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

const list: RequestHandler = async (request, response) => {
  const result = await adminAssetsService.list({
    q: request.query.q,
    assetType: request.query.assetType,
    inventoryStatus: request.query.inventoryStatus,
    assignment: request.query.assignment,
    page: request.query.page,
    pageSize: request.query.pageSize,
  });
  response.status(200).json({ data: result });
};

const summary: RequestHandler = async (_request, response) => {
  const result = await adminAssetsService.getSummary();
  response.status(200).json({ data: { summary: result } });
};

const getById: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const asset = await adminAssetsService.getById(
    pathId(request.params.id),
    context.adminUserId,
    requestContext(request),
  );
  response.status(200).json({ data: { asset } });
};

const create: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminAssetsService.create(
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(201).json({ data: result });
};

const createBatch: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminAssetsService.createBatch(
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(201).json({ data: result });
};

const listBatches: RequestHandler = async (request, response) => {
  const result = await adminAssetsService.listBatches({
    page: request.query.page,
    pageSize: request.query.pageSize,
  });
  response.status(200).json({ data: result });
};

const getBatch: RequestHandler = async (request, response) => {
  const batch = await adminAssetsService.getBatch(
    pathId(request.params.id, "Batch ID"),
  );
  response.status(200).json({ data: { batch } });
};

const rotateQr: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminAssetsService.rotateQr(
    pathId(request.params.id),
    context.adminUserId,
    request.body?.reason,
    requestContext(request),
  );
  response.status(200).json({ data: result });
};

const verifyQr: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminAssetsService.verifyQr(
    request.body?.qrData,
    context.adminUserId,
    requestContext(request),
  );
  response.status(200).json({ data: result });
};

const assign: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const asset = await adminAssetsService.assign(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { asset } });
};

const unassign: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const asset = await adminAssetsService.unassign(
    pathId(request.params.id),
    context.adminUserId,
    request.body?.reason,
    requestContext(request),
  );
  response.status(200).json({ data: { asset } });
};

const updateLifecycle: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const asset = await adminAssetsService.updateLifecycle(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { asset } });
};

export const adminAssetsController = {
  list,
  summary,
  getById,
  create,
  createBatch,
  listBatches,
  getBatch,
  rotateQr,
  verifyQr,
  assign,
  unassign,
  updateLifecycle,
};
