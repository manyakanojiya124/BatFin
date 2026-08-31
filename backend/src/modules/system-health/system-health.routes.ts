import { Router } from "express";

import { systemHealthController } from "./system-health.controller.js";

const systemHealthRouter = Router();

systemHealthRouter.get("/healthz", systemHealthController.live);
systemHealthRouter.get("/readyz", systemHealthController.ready);

export default systemHealthRouter;
