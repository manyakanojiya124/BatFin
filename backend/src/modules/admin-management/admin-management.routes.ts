import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminManagementController } from "./admin-management.controller.js";

const adminManagementRouter = Router();

adminManagementRouter.use(requireAdminSession);
adminManagementRouter.get(
  "/summary",
  requireAdminPermission("admins.read"),
  adminManagementController.summary,
);
adminManagementRouter.get(
  "/sessions/summary",
  requireAdminPermission("admins.read"),
  adminManagementController.sessionSummary,
);
adminManagementRouter.get(
  "/sessions",
  requireAdminPermission("admins.read"),
  adminManagementController.listSessions,
);
adminManagementRouter.post(
  "/sessions/:sessionId/revoke",
  requireAdminCsrf,
  requireAdminPermission("admins.manage"),
  requireRecentAdminStepUp,
  adminManagementController.revokeSession,
);
adminManagementRouter.post(
  "/invite",
  requireAdminCsrf,
  requireAdminPermission("admins.manage"),
  requireRecentAdminStepUp,
  adminManagementController.invite,
);
adminManagementRouter.get(
  "/",
  requireAdminPermission("admins.read"),
  adminManagementController.list,
);
adminManagementRouter.get(
  "/:id",
  requireAdminPermission("admins.read"),
  adminManagementController.getById,
);
adminManagementRouter.patch(
  "/:id/role",
  requireAdminCsrf,
  requireAdminPermission("admins.manage"),
  requireRecentAdminStepUp,
  adminManagementController.updateRole,
);
adminManagementRouter.patch(
  "/:id/status",
  requireAdminCsrf,
  requireAdminPermission("admins.manage"),
  requireRecentAdminStepUp,
  adminManagementController.updateStatus,
);
adminManagementRouter.post(
  "/:id/reset-credentials",
  requireAdminCsrf,
  requireAdminPermission("admins.manage"),
  requireRecentAdminStepUp,
  adminManagementController.resetCredentials,
);
adminManagementRouter.post(
  "/:id/revoke-sessions",
  requireAdminCsrf,
  requireAdminPermission("admins.manage"),
  requireRecentAdminStepUp,
  adminManagementController.revokeAdminSessions,
);

export default adminManagementRouter;
