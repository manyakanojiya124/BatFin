import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminUsersService } from "./admin-users.service.js";

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

function pathId(value: string | string[] | undefined) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, "A valid customer ID is required", "VALIDATION_ERROR");
  }
  return value;
}

const list: RequestHandler = async (request, response) => {
  const result = await adminUsersService.list({
    q: request.query.q,
    status: request.query.status,
    page: request.query.page,
    pageSize: request.query.pageSize,
  });
  response.status(200).json({ data: result });
};

const getById: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const customer = await adminUsersService.getById(
    pathId(request.params.id),
    context.adminUserId,
    requestContext(request),
  );
  response.status(200).json({ data: { customer } });
};

const updateProfile: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const customer = await adminUsersService.updateProfile(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { customer } });
};

const updateStatus: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const customer = await adminUsersService.updateStatus(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { customer } });
};

export const adminUsersController = {
  list,
  getById,
  updateProfile,
  updateStatus,
};
