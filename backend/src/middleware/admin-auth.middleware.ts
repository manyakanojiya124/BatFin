import type { RequestHandler } from "express";

import {
  ROLE_PERMISSIONS,
  type AdminPermission,
  type AdminRole,
} from "../config/admin-permissions.js";
import {
  hashOpaqueToken,
  opaqueTokenMatches,
} from "../config/admin-security.js";
import { env } from "../config/env.js";
import { prisma } from "../database/prisma.js";
import { ApiError } from "./error.middleware.js";

const STEP_UP_MAX_AGE_MS = 5 * 60 * 1000;
const LAST_SEEN_UPDATE_MS = 5 * 60 * 1000;

export interface AdminAuthContext {
  adminUserId: string;
  sessionId: string;
  csrfTokenHash: string;
  role: AdminRole;
  mustChangePassword: boolean;
  stepUpVerifiedAt: Date | null;
}

declare global {
  namespace Express {
    interface Request {
      adminAuth?: AdminAuthContext;
    }
  }
}

export const requireAdminSession: RequestHandler = async (
  request,
  _response,
  next,
) => {
  const rawToken = request.cookies?.[env.adminCookieName] as string | undefined;
  if (!rawToken) {
    next(new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED"));
    return;
  }

  const session = await prisma.adminSession.findUnique({
    where: { sessionTokenHash: hashOpaqueToken(rawToken) },
    include: { adminUser: true },
  });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt <= new Date() ||
    session.adminUser.status !== "active"
  ) {
    next(new ApiError(401, "Admin session is invalid or expired", "INVALID_ADMIN_SESSION"));
    return;
  }

  const role = session.adminUser.role as AdminRole;
  if (!(role in ROLE_PERMISSIONS)) {
    next(new ApiError(403, "Admin role is not recognized", "INVALID_ADMIN_ROLE"));
    return;
  }

  request.adminAuth = {
    adminUserId: session.adminUserId,
    sessionId: session.id,
    csrfTokenHash: session.csrfTokenHash,
    role,
    mustChangePassword: session.adminUser.mustChangePassword,
    stepUpVerifiedAt: session.stepUpVerifiedAt,
  };

  if (Date.now() - session.lastSeenAt.getTime() >= LAST_SEEN_UPDATE_MS) {
    await prisma.adminSession.update({
      where: { id: session.id },
      data: { lastSeenAt: new Date() },
    });
  }

  next();
};

export const requireAdminCsrf: RequestHandler = (request, _response, next) => {
  const context = request.adminAuth;
  if (!context) {
    next(new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED"));
    return;
  }

  const csrfToken = request.header("x-csrf-token");
  if (!csrfToken || !opaqueTokenMatches(csrfToken, context.csrfTokenHash)) {
    next(new ApiError(403, "CSRF verification failed", "ADMIN_CSRF_REJECTED"));
    return;
  }
  next();
};

export function requireAdminPermission(
  permission: AdminPermission,
): RequestHandler {
  return (request, _response, next) => {
    const context = request.adminAuth;
    if (!context) {
      next(new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED"));
      return;
    }
    if (context.mustChangePassword) {
      next(
        new ApiError(
          403,
          "Password change is required before accessing admin operations",
          "ADMIN_PASSWORD_CHANGE_REQUIRED",
        ),
      );
      return;
    }
    if (!ROLE_PERMISSIONS[context.role].includes(permission)) {
      next(new ApiError(403, "Admin permission denied", "ADMIN_FORBIDDEN"));
      return;
    }
    next();
  };
}

export const requireRecentAdminStepUp: RequestHandler = (
  request,
  _response,
  next,
) => {
  const context = request.adminAuth;
  if (!context) {
    next(new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED"));
    return;
  }
  if (
    !context.stepUpVerifiedAt ||
    Date.now() - context.stepUpVerifiedAt.getTime() > STEP_UP_MAX_AGE_MS
  ) {
    next(
      new ApiError(
        403,
        "Fresh authenticator verification is required",
        "ADMIN_STEP_UP_REQUIRED",
      ),
    );
    return;
  }
  next();
};
