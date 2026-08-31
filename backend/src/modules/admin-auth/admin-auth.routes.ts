import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminSession,
} from "../../middleware/admin-auth.middleware.js";
import { adminAuthController } from "./admin-auth.controller.js";

const adminAuthRouter = Router();

adminAuthRouter.post("/login", adminAuthController.login);
adminAuthRouter.post("/verify-mfa", adminAuthController.verifyMfa);

adminAuthRouter.use(requireAdminSession);
adminAuthRouter.get("/me", adminAuthController.me);
adminAuthRouter.get("/csrf", adminAuthController.csrf);
adminAuthRouter.post(
  "/step-up",
  requireAdminCsrf,
  adminAuthController.stepUp,
);
adminAuthRouter.post(
  "/change-password",
  requireAdminCsrf,
  adminAuthController.changePassword,
);
adminAuthRouter.post(
  "/logout",
  requireAdminCsrf,
  adminAuthController.logout,
);
adminAuthRouter.post(
  "/revoke-all-sessions",
  requireAdminCsrf,
  adminAuthController.revokeAllSessions,
);

export default adminAuthRouter;
