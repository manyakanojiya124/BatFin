import { Router } from "express";

import { requireAuth } from "../../middleware/auth.middleware.js";
import { usersController } from "./users.controller.js";

const usersRouter = Router();

usersRouter.use(requireAuth);
usersRouter.get("/me", usersController.getMe);
usersRouter.patch("/me", usersController.updateMe);
usersRouter.get("/me/portfolio", usersController.portfolio);
usersRouter.post("/me/portfolio/claim", usersController.claimPortfolio);

export default usersRouter;
