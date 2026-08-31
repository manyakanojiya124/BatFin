import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";

import { env } from "./config/env.js";
import {
  errorHandler,
  notFoundHandler,
} from "./middleware/error.middleware.js";
import { enforcePlatformAvailability } from "./middleware/platform-settings.middleware.js";
import {
  adminLoginRateLimiter,
  adminMfaRateLimiter,
  apiRateLimiter,
  customerOtpSendRateLimiter,
  customerOtpVerifyRateLimiter,
  requestSecurityContext,
} from "./middleware/security.middleware.js";
import adminAnalyticsRouter from "./modules/admin-analytics/admin-analytics.routes.js";
import adminAssetsRouter from "./modules/admin-assets/admin-assets.routes.js";
import adminAuditRouter from "./modules/admin-audit/admin-audit.routes.js";
import adminAuthRouter from "./modules/admin-auth/admin-auth.routes.js";
import adminDashboardRouter from "./modules/admin-dashboard/admin-dashboard.routes.js";
import adminManagementRouter from "./modules/admin-management/admin-management.routes.js";
import adminMasterDataRouter from "./modules/admin-master-data/admin-master-data.routes.js";
import adminPaymentsRouter from "./modules/admin-payments/admin-payments.routes.js";
import adminPortfolioRouter from "./modules/portfolio/admin-portfolio.routes.js";
import adminSettingsRouter from "./modules/admin-settings/admin-settings.routes.js";
import adminTicketsRouter from "./modules/admin-tickets/admin-tickets.routes.js";
import adminUsersRouter from "./modules/admin-users/admin-users.routes.js";
import assetsRouter from "./modules/assets/assets.routes.js";
import authRouter from "./modules/auth/auth.routes.js";
import healthRouter from "./modules/health/health.routes.js";
import ledgerRouter from "./modules/ledger/ledger.routes.js";
import paymentsRouter from "./modules/payments/payments.routes.js";
import plansRouter, {
  subscriptionsRouter,
} from "./modules/plans/plans.routes.js";
import supportRouter from "./modules/support/support.routes.js";
import systemHealthRouter from "./modules/system-health/system-health.routes.js";
import usersRouter from "./modules/users/users.routes.js";

export const app = express();

app.disable("x-powered-by");
if (env.nodeEnv === "production") app.set("trust proxy", 1);
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        imgSrc: ["'self'", "data:", "blob:"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        upgradeInsecureRequests: env.nodeEnv === "production" ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "same-site" },
    frameguard: { action: "deny" },
    referrerPolicy: { policy: "no-referrer" },
    strictTransportSecurity:
      env.nodeEnv === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
  }),
);
app.use(requestSecurityContext);
if (env.nodeEnv === "production") {
  const allowedHostnames = [env.customerHostname, env.adminHostname].filter(
    (hostname): hostname is string => Boolean(hostname),
  );
  if (allowedHostnames.length > 0) {
    app.use((request, response, next) => {
      if (!allowedHostnames.includes(request.hostname.toLowerCase())) {
        response.status(421).json({
          error: { code: "INVALID_HOST", message: "Request host is not allowed" },
        });
        return;
      }
      next();
    });
  }
}
app.use(
  cors({
    origin: env.corsOrigins,
    credentials: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "x-csrf-token"],
    maxAge: 600,
  }),
);
app.use(express.json({ limit: "100kb", strict: true }));
app.use(cookieParser());
app.use(systemHealthRouter);
app.use("/api/v1", apiRateLimiter);
app.use("/api/v1/admin/auth/login", adminLoginRateLimiter);
app.use("/api/v1/admin/auth/verify-mfa", adminMfaRateLimiter);
app.use("/api/v1/auth/send-otp", customerOtpSendRateLimiter);
app.use("/api/v1/auth/verify-otp", customerOtpVerifyRateLimiter);
app.use("/api/v1", enforcePlatformAvailability);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/users", usersRouter);
app.use("/api/v1/assets", assetsRouter);
app.use("/api/v1/assets", healthRouter);
app.use("/api/v1/plans", plansRouter);
app.use("/api/v1/subscriptions", subscriptionsRouter);
app.use("/api/v1/ledger", ledgerRouter);
app.use("/api/v1/payments", paymentsRouter);
app.use("/api/v1/support", supportRouter);
app.use("/api/v1/admin/auth", adminAuthRouter);
app.use("/api/v1/admin/dashboard", adminDashboardRouter);
app.use("/api/v1/admin/users", adminUsersRouter);
app.use("/api/v1/admin/assets", adminAssetsRouter);
app.use("/api/v1/admin/tickets", adminTicketsRouter);
app.use("/api/v1/admin/payments", adminPaymentsRouter);
app.use("/api/v1/admin/audit", adminAuditRouter);
app.use("/api/v1/admin/admins", adminManagementRouter);
app.use("/api/v1/admin/settings", adminSettingsRouter);
app.use("/api/v1/admin/data", adminMasterDataRouter);
app.use("/api/v1/admin/analytics", adminAnalyticsRouter);
app.use("/api/v1/admin/portfolio", adminPortfolioRouter);

if (env.nodeEnv === "production") {
  const moduleDirectory = path.dirname(fileURLToPath(import.meta.url));
  const customerDirectory = path.resolve(moduleDirectory, "../../frontend/dist");
  const adminDirectory = path.resolve(moduleDirectory, "../../admin-frontend/dist");
  const customerIndex = path.join(customerDirectory, "index.html");
  const adminIndex = path.join(adminDirectory, "index.html");

  if (!existsSync(customerIndex) || !existsSync(adminIndex)) {
    throw new Error(
      "Customer and admin production builds are required. Run npm run build in frontend and admin-frontend before starting production.",
    );
  }

  const customerStatic = express.static(customerDirectory, { index: false });
  const adminStatic = express.static(adminDirectory, { index: false });
  app.use((request, response, next) => {
    if (request.method !== "GET" || request.path.startsWith("/api/")) {
      next();
      return;
    }
    const isAdminHost =
      env.adminHostname !== null &&
      request.hostname.toLowerCase() === env.adminHostname;
    const staticHandler = isAdminHost ? adminStatic : customerStatic;
    const indexFile = isAdminHost ? adminIndex : customerIndex;
    staticHandler(request, response, (staticError) => {
      if (staticError) {
        next(staticError);
        return;
      }
      response.sendFile(indexFile, (sendError) => {
        if (sendError) next(sendError);
      });
    });
  });
}

app.use(notFoundHandler);
app.use(errorHandler);
