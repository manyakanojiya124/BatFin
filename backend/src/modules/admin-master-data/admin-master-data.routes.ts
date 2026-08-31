import { Router } from "express";
import multer from "multer";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
  requireRecentAdminStepUp,
} from "../../middleware/admin-auth.middleware.js";
import { adminMasterDataController } from "./admin-master-data.controller.js";

const adminMasterDataRouter = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 5, fieldSize: 10_000 },
});

adminMasterDataRouter.use(requireAdminSession);
adminMasterDataRouter.get("/catalog", requireAdminPermission("master_data.read"), adminMasterDataController.catalog);
adminMasterDataRouter.get("/summary", requireAdminPermission("master_data.read"), adminMasterDataController.summary);
adminMasterDataRouter.get("/imports", requireAdminPermission("master_data.read"), adminMasterDataController.imports);
adminMasterDataRouter.get("/:datasetType/export", requireAdminPermission("master_data.export"), adminMasterDataController.exportCsv);
adminMasterDataRouter.post("/:datasetType/validate", requireAdminCsrf, requireAdminPermission("master_data.import"), upload.single("file"), adminMasterDataController.validate);
adminMasterDataRouter.post("/:datasetType/import", requireAdminCsrf, requireAdminPermission("master_data.import"), requireRecentAdminStepUp, upload.single("file"), adminMasterDataController.importFile);
adminMasterDataRouter.get("/:datasetType/records", requireAdminPermission("master_data.read"), adminMasterDataController.records);
adminMasterDataRouter.get("/:datasetType/records/:businessKey/history", requireAdminPermission("master_data.read"), adminMasterDataController.history);

export default adminMasterDataRouter;
