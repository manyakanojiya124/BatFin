import type { RequestHandler } from "express";
import jwt from "jsonwebtoken";

import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { ApiError } from "./error.middleware.js";

export interface AuthContext {
  userId: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthContext;
    }
  }
}

export const requireAuth: RequestHandler = async (request, _response, next) => {
  const authorization = request.header("authorization");

  if (!authorization?.startsWith("Bearer ")) {
    next(new ApiError(401, "Authentication is required", "UNAUTHORIZED"));
    return;
  }

  const token = authorization.slice("Bearer ".length).trim();
  let userId: string;
  let phone: string;

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    if (
      typeof payload === "string" ||
      typeof payload.sub !== "string" ||
      typeof payload.phone !== "string"
    ) {
      throw new Error("Invalid token payload");
    }
    userId = payload.sub;
    phone = payload.phone;
  } catch {
    next(
      new ApiError(
        401,
        "The authentication token is invalid or expired",
        "INVALID_TOKEN",
      ),
    );
    return;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountStatus: true, lastActivityAt: true },
  });
  if (!user) {
    next(new ApiError(401, "Customer account was not found", "INVALID_TOKEN"));
    return;
  }
  if (user.accountStatus !== "active") {
    next(
      new ApiError(
        403,
        "This customer account is not active",
        "ACCOUNT_NOT_ACTIVE",
      ),
    );
    return;
  }

  request.auth = { userId, phone };
  if(!user.lastActivityAt||Date.now()-user.lastActivityAt.getTime()>5*60*1000){await prisma.user.update({where:{id:userId},data:{lastActivityAt:new Date()}})}
  next();
};
