import { Router } from "express";

import {
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminDashboardController } from "./admin-dashboard.controller.js";

const adminDashboardRouter = Router();

adminDashboardRouter.use(requireAdminSession);
adminDashboardRouter.get(
  "/access",
  requireAdminPermission("dashboard.read"),
  adminDashboardController.getAccessSummary,
);
adminDashboardRouter.get("/events",requireAdminPermission("dashboard.read"),adminDashboardController.events);
adminDashboardRouter.get(
  "/metrics",
  requireAdminPermission("dashboard.read"),
  adminDashboardController.getMetrics,
);
adminDashboardRouter.get(
  "/step-up-access",
  requireAdminPermission("system.configure"),
  requireRecentAdminStepUp,
  adminDashboardController.getStepUpAccess,
);

export default adminDashboardRouter;
