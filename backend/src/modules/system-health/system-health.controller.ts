import type { RequestHandler } from "express";

import { systemHealthService } from "./system-health.service.js";

const live: RequestHandler = (_request, response) => {
  response.status(200).json({ data: systemHealthService.liveness() });
};

const ready: RequestHandler = async (_request, response) => {
  response.status(200).json({ data: await systemHealthService.readiness() });
};

export const systemHealthController = { live, ready };
