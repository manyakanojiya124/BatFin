import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminAssetsController } from "./admin-assets.controller.js";

const adminAssetsRouter = Router();

adminAssetsRouter.use(requireAdminSession);
adminAssetsRouter.get(
  "/summary",
  requireAdminPermission("inventory.read"),
  adminAssetsController.summary,
);
adminAssetsRouter.get(
  "/batches",
  requireAdminPermission("inventory.read"),
  adminAssetsController.listBatches,
);
adminAssetsRouter.get(
  "/batches/:id",
  requireAdminPermission("inventory.read"),
  adminAssetsController.getBatch,
);
adminAssetsRouter.post(
  "/batches",
  requireAdminCsrf,
  requireAdminPermission("inventory.create"),
  adminAssetsController.createBatch,
);
adminAssetsRouter.post(
  "/verify-qr",
  requireAdminCsrf,
  requireAdminPermission("inventory.verify_qr"),
  adminAssetsController.verifyQr,
);
adminAssetsRouter.get(
  "/",
  requireAdminPermission("inventory.read"),
  adminAssetsController.list,
);
adminAssetsRouter.post(
  "/",
  requireAdminCsrf,
  requireAdminPermission("inventory.create"),
  adminAssetsController.create,
);
adminAssetsRouter.get(
  "/:id",
  requireAdminPermission("inventory.read"),
  adminAssetsController.getById,
);
adminAssetsRouter.post(
  "/:id/qr",
  requireAdminCsrf,
  requireAdminPermission("inventory.verify_qr"),
  requireRecentAdminStepUp,
  adminAssetsController.rotateQr,
);
adminAssetsRouter.post(
  "/:id/assign",
  requireAdminCsrf,
  requireAdminPermission("inventory.assign"),
  requireRecentAdminStepUp,
  adminAssetsController.assign,
);
adminAssetsRouter.post(
  "/:id/unassign",
  requireAdminCsrf,
  requireAdminPermission("inventory.assign"),
  requireRecentAdminStepUp,
  adminAssetsController.unassign,
);
adminAssetsRouter.patch(
  "/:id/lifecycle",
  requireAdminCsrf,
  requireAdminPermission("inventory.create"),
  requireRecentAdminStepUp,
  adminAssetsController.updateLifecycle,
);

export default adminAssetsRouter;
