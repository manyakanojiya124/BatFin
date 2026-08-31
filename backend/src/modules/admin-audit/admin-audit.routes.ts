import { Router } from "express";

import {
  requireAdminPermission,
  requireAdminSession,
} from "../../middleware/admin-auth.middleware.js";
import { adminAuditController } from "./admin-audit.controller.js";

const adminAuditRouter = Router();

adminAuditRouter.use(requireAdminSession);
adminAuditRouter.get(
  "/summary",
  requireAdminPermission("audit.read"),
  adminAuditController.summary,
);
adminAuditRouter.get(
  "/facets",
  requireAdminPermission("audit.read"),
  adminAuditController.facets,
);
adminAuditRouter.get(
  "/export",
  requireAdminPermission("audit.export"),
  adminAuditController.exportCsv,
);
adminAuditRouter.get(
  "/",
  requireAdminPermission("audit.read"),
  adminAuditController.list,
);

export default adminAuditRouter;
