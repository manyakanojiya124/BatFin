import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { plansService } from "./plans.service.js";

function getAuthenticatedUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError(401, "Authentication is required", "UNAUTHORIZED");
  }

  return userId;
}

const listPlans: RequestHandler = async (_request, response) => {
  const plans = await plansService.listPlans();
  response.status(200).json({ data: { plans } });
};

const createSubscription: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const subscription = await plansService.createSubscription(
    userId,
    request.body ?? {},
  );
  response.status(201).json({ data: { subscription } });
};

const getActiveSubscription: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const subscription = await plansService.getActiveSubscription(userId);
  response.status(200).json({ data: { subscription } });
};

export const plansController = {
  listPlans,
  createSubscription,
  getActiveSubscription,
};
