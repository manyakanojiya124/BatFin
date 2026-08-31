import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminPaymentsController } from "./admin-payments.controller.js";

const adminPaymentsRouter = Router();

adminPaymentsRouter.use(requireAdminSession);
adminPaymentsRouter.get(
  "/summary",
  requireAdminPermission("payments.read"),
  adminPaymentsController.summary,
);
adminPaymentsRouter.get(
  "/export",
  requireAdminPermission("payments.export"),
  adminPaymentsController.exportCsv,
);
adminPaymentsRouter.get(
  "/provider-reference/:reference",
  requireAdminPermission("payments.read"),
  adminPaymentsController.providerLookup,
);
adminPaymentsRouter.get(
  "/",
  requireAdminPermission("payments.read"),
  adminPaymentsController.list,
);
adminPaymentsRouter.post(
  "/adjustments",
  requireAdminCsrf,
  requireAdminPermission("payments.adjust"),
  requireRecentAdminStepUp,
  adminPaymentsController.createAdjustment,
);
adminPaymentsRouter.post(
  "/:id/refunds",
  requireAdminCsrf,
  requireAdminPermission("payments.refund"),
  requireRecentAdminStepUp,
  adminPaymentsController.createRefund,
);
adminPaymentsRouter.get(
  "/:id",
  requireAdminPermission("payments.read"),
  adminPaymentsController.getById,
);

export default adminPaymentsRouter;
