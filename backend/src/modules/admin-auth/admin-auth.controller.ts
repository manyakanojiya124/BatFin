import type { Request, RequestHandler, Response } from "express";

import { env } from "../../config/env.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { adminAuthService } from "./admin-auth.service.js";

function requestContext(request: Request) {
  return {
    ipAddress: request.ip || null,
    userAgent: request.header("user-agent")?.slice(0, 500) ?? null,
  };
}

function authContext(request: Request) {
  if (!request.adminAuth) {
    throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  }
  return request.adminAuth;
}

function sessionCookie(response: Response, token: string, expiresAt: Date) {
  response.cookie(env.adminCookieName, token, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    path: "/api/v1/admin",
    expires: expiresAt,
  });
}

function clearSessionCookie(response: Response) {
  response.clearCookie(env.adminCookieName, {
    httpOnly: true,
    secure: env.nodeEnv === "production",
    sameSite: "strict",
    path: "/api/v1/admin",
  });
}

const login: RequestHandler = async (request, response) => {
  const result = await adminAuthService.beginLogin(
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: result });
};

const verifyMfa: RequestHandler = async (request, response) => {
  const result = await adminAuthService.verifyMfa(
    request.body ?? {},
    requestContext(request),
  );
  sessionCookie(response, result.sessionToken, result.sessionExpiresAt);
  response.status(200).json({
    data: {
      admin: result.admin,
      csrfToken: result.csrfToken,
      sessionExpiresAt: result.sessionExpiresAt,
      ...(result.backupCodes.length > 0
        ? { backupCodes: result.backupCodes }
        : {}),
    },
  });
};

const me: RequestHandler = async (request, response) => {
  const context = authContext(request);
  const admin = await adminAuthService.getMe(context.adminUserId);
  response.status(200).json({
    data: {
      admin,
      stepUpVerifiedAt: context.stepUpVerifiedAt,
    },
  });
};

const csrf: RequestHandler = async (request, response) => {
  const context = authContext(request);
  const csrfToken = await adminAuthService.rotateCsrf(context.sessionId);
  response.status(200).json({ data: { csrfToken } });
};

const stepUp: RequestHandler = async (request, response) => {
  const context = authContext(request);
  const result = await adminAuthService.stepUp(
    context.adminUserId,
    context.sessionId,
    request.body?.code,
    requestContext(request),
  );
  response.status(200).json({ data: result });
};

const changePassword: RequestHandler = async (request, response) => {
  const context = authContext(request);
  const admin = await adminAuthService.changePassword(
    context.adminUserId,
    context.sessionId,
    request.body ?? {},
    requestContext(request),
  );
  response.status(200).json({ data: { admin } });
};

const logout: RequestHandler = async (request, response) => {
  const context = authContext(request);
  await adminAuthService.logout(
    context.adminUserId,
    context.sessionId,
    requestContext(request),
  );
  clearSessionCookie(response);
  response.status(200).json({ data: { loggedOut: true } });
};

const revokeAllSessions: RequestHandler = async (request, response) => {
  const context = authContext(request);
  const revokedCount = await adminAuthService.revokeAllSessions(
    context.adminUserId,
    requestContext(request),
  );
  clearSessionCookie(response);
  response.status(200).json({ data: { revokedCount } });
};

export const adminAuthController = {
  login,
  verifyMfa,
  me,
  csrf,
  stepUp,
  changePassword,
  logout,
  revokeAllSessions,
};
