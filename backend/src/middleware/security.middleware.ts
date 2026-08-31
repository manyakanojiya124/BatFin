import { randomUUID } from "node:crypto";

import type { RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";

function rateLimitHandler(message: string): RequestHandler {
  return (_request, response) => {
    response.status(429).json({
      error: { code: "RATE_LIMIT_EXCEEDED", message },
    });
  };
}

export const apiRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rateLimitHandler("Too many API requests. Try again later."),
});

export const adminLoginRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 10,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler("Too many admin login attempts. Try again later."),
});

export const adminMfaRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler("Too many administrator verification attempts. Try again later."),
});

export const customerOtpSendRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 8,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: rateLimitHandler("Too many OTP requests. Try again later."),
});

export const customerOtpVerifyRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: rateLimitHandler("Too many OTP verification attempts. Try again later."),
});

export const requestSecurityContext: RequestHandler = (request, response, next) => {
  const requestId = randomUUID();
  response.setHeader("x-request-id", requestId);
  response.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(self), payment=()",
  );
  if (request.path.startsWith("/api/")) {
    response.setHeader("Cache-Control", "no-store");
    response.setHeader("Pragma", "no-cache");
  }
  next();
};
