import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { healthService } from "./health.service.js";

function getAuthenticatedUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError(401, "Authentication is required", "UNAUTHORIZED");
  }

  return userId;
}

function getAssetId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, "A valid asset ID is required", "VALIDATION_ERROR");
  }

  return value;
}

const getAssetHealth: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const health = await healthService.getAssetHealth(
    userId,
    getAssetId(request.params.id),
  );
  response.status(200).json({ data: { health } });
};

export const healthController = {
  getAssetHealth,
};
