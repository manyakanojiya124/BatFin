import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { assetsController } from "./assets.controller.js";

const assetsRouter = Router();

assetsRouter.use(requireAuth);
assetsRouter.get("/", assetsController.list);
assetsRouter.post("/", assetsController.create);
assetsRouter.get("/:id", assetsController.getById);
assetsRouter.post("/:id/lock", assetsController.lock);
assetsRouter.post("/:id/unlock", assetsController.unlock);
assetsRouter.get("/:id/location", assetsController.getLocation);

export default assetsRouter;
