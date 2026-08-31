import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { supportController } from "./support.controller.js";

const supportRouter = Router();

supportRouter.use(requireAuth);
supportRouter.post("/tickets", supportController.create);
supportRouter.get("/tickets", supportController.list);

export default supportRouter;
