import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { supportService } from "./support.service.js";

function getAuthenticatedUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError(401, "Authentication is required", "UNAUTHORIZED");
  }

  return userId;
}

const create: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const ticket = await supportService.create(userId, request.body ?? {});
  response.status(201).json({ data: { ticket } });
};

const list: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const tickets = await supportService.list(userId);
  response.status(200).json({ data: { tickets } });
};

export const supportController = {
  create,
  list,
};
