import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { ledgerController } from "./ledger.controller.js";

const ledgerRouter = Router();

ledgerRouter.use(requireAuth);
ledgerRouter.get("/summary", ledgerController.getSummary);
ledgerRouter.get("/", ledgerController.list);

export default ledgerRouter;
