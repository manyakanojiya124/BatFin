import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { claimPortfolioForUser, getUserPortfolio } from "../portfolio/portfolio.service.js";
import { usersService } from "./users.service.js";

function getAuthenticatedUserId(userId: string | undefined): string {
  if (!userId) {
    throw new ApiError(401, "Authentication is required", "UNAUTHORIZED");
  }

  return userId;
}

const getMe: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const user = await usersService.getMe(userId);
  response.status(200).json({ data: { user } });
};

const updateMe: RequestHandler = async (request, response) => {
  const userId = getAuthenticatedUserId(request.auth?.userId);
  const user = await usersService.updateMe(userId, request.body ?? {});
  response.status(200).json({ data: { user } });
};
const portfolio:RequestHandler=async(request,response)=>{const userId=getAuthenticatedUserId(request.auth?.userId);response.status(200).json({data:await getUserPortfolio(userId)})};
const claimPortfolio:RequestHandler=async(request,response)=>{const userId=getAuthenticatedUserId(request.auth?.userId);response.status(200).json({data:{account:await claimPortfolioForUser(userId,request.body??{})}})};

export const usersController = {
  getMe,
  updateMe,
  portfolio,
  claimPortfolio,
};
