import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminTicketsService } from "./admin-tickets.service.js";

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
    throw new ApiError(400, "Ticket ID is required", "VALIDATION_ERROR");
  }
  return value;
}

const list: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const result = await adminTicketsService.list(context.adminUserId, {
    q: request.query.q,
    status: request.query.status,
    priority: request.query.priority,
    type: request.query.type,
    assignment: request.query.assignment,
    page: request.query.page,
    pageSize: request.query.pageSize,
  });
  response.status(200).json({ data: result });
};
const summary: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: { summary: await adminTicketsService.getSummary() } });
};
const assignees: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: { assignees: await adminTicketsService.listAssignees() } });
};
const getById: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const ticket = await adminTicketsService.getById(
    pathId(request.params.id),
    context.adminUserId,
    requestContext(request),
  );
  response.status(200).json({ data: { ticket } });
};
const assign: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const ticket = await adminTicketsService.assign(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { ticket } });
};
const priority: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const ticket = await adminTicketsService.updatePriority(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { ticket } });
};
const status: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const ticket = await adminTicketsService.updateStatus(
    pathId(request.params.id),
    context.adminUserId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { ticket } });
};
const addNote: RequestHandler = async (request, response) => {
  const context = adminContext(request);
  const note = await adminTicketsService.addNote(
    pathId(request.params.id),
    context.adminUserId,
    request.body?.body,
    requestContext(request),
  );
  response.status(201).json({ data: { note } });
};

export const adminTicketsController = {
  list,
  summary,
  assignees,
  getById,
  assign,
  priority,
  status,
  addNote,
};
