import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminUsersController } from "./admin-users.controller.js";

const adminUsersRouter = Router();

adminUsersRouter.use(requireAdminSession);
adminUsersRouter.get(
  "/",
  requireAdminPermission("customers.read"),
  adminUsersController.list,
);
adminUsersRouter.get(
  "/:id",
  requireAdminPermission("customers.read"),
  adminUsersController.getById,
);
adminUsersRouter.patch(
  "/:id",
  requireAdminCsrf,
  requireAdminPermission("customers.update"),
  adminUsersController.updateProfile,
);
adminUsersRouter.patch(
  "/:id/status",
  requireAdminCsrf,
  requireAdminPermission("customers.update"),
  requireRecentAdminStepUp,
  adminUsersController.updateStatus,
);

export default adminUsersRouter;
