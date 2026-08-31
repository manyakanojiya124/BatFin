import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { healthController } from "./health.controller.js";

const healthRouter = Router();

healthRouter.use(requireAuth);
healthRouter.get("/:id/health", healthController.getAssetHealth);

export default healthRouter;
