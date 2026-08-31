import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { plansController } from "./plans.controller.js";

const plansRouter = Router();
const subscriptionsRouter = Router();

plansRouter.get("/", plansController.listPlans);

subscriptionsRouter.use(requireAuth);
subscriptionsRouter.post("/", plansController.createSubscription);
subscriptionsRouter.get("/active", plansController.getActiveSubscription);

export { subscriptionsRouter };
export default plansRouter;
