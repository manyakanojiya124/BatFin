import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { assetsService } from "./assets.service.js";

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

const list: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const assets = await assetsService.list(userId);
  response.status(200).json({ data: { assets } });
};

const create: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const asset = await assetsService.create(userId, request.body ?? {});
  response.status(201).json({ data: { asset } });
};

const getById: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const asset = await assetsService.getById(
    userId,
    getAssetId(request.params.id),
  );
  response.status(200).json({ data: { asset } });
};

const lock: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const asset = await assetsService.lock(
    userId,
    getAssetId(request.params.id),
  );
  response.status(200).json({ data: { asset } });
};

const unlock: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const asset = await assetsService.unlock(
    userId,
    getAssetId(request.params.id),
  );
  response.status(200).json({ data: { asset } });
};

const getLocation: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const location = await assetsService.getLocation(
    userId,
    getAssetId(request.params.id),
  );
  response.status(200).json({ data: { location } });
};

export const assetsController = {
  list,
  create,
  getById,
  lock,
  unlock,
  getLocation,
};
