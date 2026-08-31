import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminSettingsController } from "./admin-settings.controller.js";

const adminSettingsRouter = Router();

adminSettingsRouter.use(requireAdminSession);
adminSettingsRouter.get(
  "/",
  requireAdminPermission("system.configure"),
  adminSettingsController.get,
);
adminSettingsRouter.patch(
  "/",
  requireAdminCsrf,
  requireAdminPermission("system.configure"),
  requireRecentAdminStepUp,
  adminSettingsController.update,
);

export default adminSettingsRouter;
