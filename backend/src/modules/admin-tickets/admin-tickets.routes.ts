import { Router } from "express";

import {
  requireAdminCsrf,
  requireAdminPermission,
  requireAdminSession,
} from "../../middleware/admin-auth.middleware.js";
import { adminTicketsController } from "./admin-tickets.controller.js";

const adminTicketsRouter = Router();

adminTicketsRouter.use(requireAdminSession);
adminTicketsRouter.get(
  "/summary",
  requireAdminPermission("tickets.read"),
  adminTicketsController.summary,
);
adminTicketsRouter.get(
  "/assignees",
  requireAdminPermission("tickets.read"),
  adminTicketsController.assignees,
);
adminTicketsRouter.get(
  "/",
  requireAdminPermission("tickets.read"),
  adminTicketsController.list,
);
adminTicketsRouter.get(
  "/:id",
  requireAdminPermission("tickets.read"),
  adminTicketsController.getById,
);
adminTicketsRouter.patch(
  "/:id/assign",
  requireAdminCsrf,
  requireAdminPermission("tickets.update"),
  adminTicketsController.assign,
);
adminTicketsRouter.patch(
  "/:id/priority",
  requireAdminCsrf,
  requireAdminPermission("tickets.update"),
  adminTicketsController.priority,
);
adminTicketsRouter.patch(
  "/:id/status",
  requireAdminCsrf,
  requireAdminPermission("tickets.update"),
  adminTicketsController.status,
);
adminTicketsRouter.post(
  "/:id/notes",
  requireAdminCsrf,
  requireAdminPermission("tickets.update"),
  adminTicketsController.addNote,
);

export default adminTicketsRouter;
