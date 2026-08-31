import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { ledgerService } from "./ledger.service.js";

function getAuthenticatedUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError(401, "Authentication is required", "UNAUTHORIZED");
  }

  return userId;
}

const list: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const transactions = await ledgerService.list(userId, request.query.type);
  response.status(200).json({ data: { transactions } });
};

const getSummary: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const summary = await ledgerService.getSummary(userId);
  response.status(200).json({ data: { summary } });
};

export const ledgerController = {
  list,
  getSummary,
};
