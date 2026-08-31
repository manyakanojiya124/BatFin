import type { Request, RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { adminSettingsService } from "./admin-settings.service.js";

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

const get: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await adminSettingsService.get() });
};

const update: RequestHandler = async (request, response) => {
  const admin = auth(request);
  const setting = await adminSettingsService.update(
    admin.adminUserId,
    request.body ?? {},
    context(request),
  );
  response.status(200).json({ data: { setting } });
};

export const adminSettingsController = { get, update };
