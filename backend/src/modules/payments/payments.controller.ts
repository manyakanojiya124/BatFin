import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { paymentsService } from "./payments.service.js";

function getAuthenticatedUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError(401, "Authentication is required", "UNAUTHORIZED");
  }

  return userId;
}

function getTransactionId(value: string | string[] | undefined): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(
      400,
      "A valid transaction ID is required",
      "VALIDATION_ERROR",
    );
  }

  return value;
}

const create: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const payment = await paymentsService.create(userId, request.body ?? {});
  response.status(201).json({
    data: {
      transactionId: payment.transactionId,
      payment,
    },
  });
};

const getById: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const payment = await paymentsService.getById(
    userId,
    getTransactionId(request.params.id),
  );
  response.status(200).json({ data: { payment } });
};

export const paymentsController = {
  create,
  getById,
};
