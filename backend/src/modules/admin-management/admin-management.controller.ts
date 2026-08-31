import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminManagementService } from "./admin-management.service.js";

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

function pathId(value: string | string[] | undefined, label: string) {
  if (typeof value !== "string" || !value) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

const list: RequestHandler = async (request, response) => {
  response.status(200).json({
    data: await adminManagementService.list({
      q: request.query.q,
      role: request.query.role,
      status: request.query.status,
      page: request.query.page,
      pageSize: request.query.pageSize,
    }),
  });
};

const summary: RequestHandler = async (_request, response) => {
  response.status(200).json({
    data: { summary: await adminManagementService.getSummary() },
  });
};

const getById: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const target = await adminManagementService.getById(
    pathId(request.params.id, "Administrator ID"),
    admin.adminUserId,
    context(request),
  );
  response.status(200).json({ data: { admin: target } });
};

const invite: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminManagementService.invite(
    admin.adminUserId,
    request.body ?? {},
    context(request),
  );
  response.status(201).json({ data: result });
};

const updateRole: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const target = await adminManagementService.updateRole(
    pathId(request.params.id, "Administrator ID"),
    admin.adminUserId,
    request.body ?? {},
    context(request),
  );
  response.status(200).json({ data: { admin: target } });
};

const updateStatus: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const target = await adminManagementService.updateStatus(
    pathId(request.params.id, "Administrator ID"),
    admin.adminUserId,
    request.body ?? {},
    context(request),
  );
  response.status(200).json({ data: { admin: target } });
};

const resetCredentials: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminManagementService.resetCredentials(
    pathId(request.params.id, "Administrator ID"),
    admin.adminUserId,
    request.body?.reason,
    context(request),
  );
  response.status(200).json({ data: result });
};

const listSessions: RequestHandler = async (request, response) => {
  const admin = auth(request);
  response.status(200).json({
    data: await adminManagementService.listSessions(
      {
        q: request.query.q,
        adminUserId: request.query.adminUserId,
        status: request.query.status,
        page: request.query.page,
        pageSize: request.query.pageSize,
      },
      admin.sessionId,
    ),
  });
};

const sessionSummary: RequestHandler = async (_request, response) => {
  response.status(200).json({
    data: { summary: await adminManagementService.getSessionSummary() },
  });
};

const revokeSession: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const session = await adminManagementService.revokeSession(
    pathId(request.params.sessionId, "Session ID"),
    admin.adminUserId,
    admin.sessionId,
    request.body?.reason,
    context(request),
  );
  response.status(200).json({ data: { session } });
};

const revokeAdminSessions: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const result = await adminManagementService.revokeAdminSessions(
    pathId(request.params.id, "Administrator ID"),
    admin.adminUserId,
    admin.sessionId,
    request.body?.reason,
    context(request),
  );
  response.status(200).json({ data: result });
};

export const adminManagementController = {
  list,
  summary,
  getById,
  invite,
  updateRole,
  updateStatus,
  resetCredentials,
  listSessions,
  sessionSummary,
  revokeSession,
  revokeAdminSessions,
};
