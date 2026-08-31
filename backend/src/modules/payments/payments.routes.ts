import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { paymentsController } from "./payments.controller.js";

const paymentsRouter = Router();

paymentsRouter.use(requireAuth);
paymentsRouter.post("/create", paymentsController.create);
paymentsRouter.get("/:id", paymentsController.getById);

export default paymentsRouter;
