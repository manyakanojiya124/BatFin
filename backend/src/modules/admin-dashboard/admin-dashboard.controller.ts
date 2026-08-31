import type { RequestHandler } from "express";

import { ApiError } from "../../middleware/error.middleware.js";
import { subscribePlatformChanges } from "../platform-events.js";
import { adminDashboardService } from "./admin-dashboard.service.js";

const getAccessSummary: RequestHandler = (request, response) => {
  if (!request.adminAuth) {
    throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  }
  response.status(200).json({
    data: adminDashboardService.getAccessSummary(request.adminAuth.role),
  });
};

const getMetrics: RequestHandler = async (_request, response) => {
  const metrics = await adminDashboardService.getMetrics();
  response.status(200).json({ data: { metrics } });
};

const events:RequestHandler=(request,response)=>{if(!request.adminAuth)throw new ApiError(401,"Admin authentication is required","ADMIN_UNAUTHORIZED");response.status(200);response.setHeader("Content-Type","text/event-stream");response.setHeader("Cache-Control","no-cache, no-transform");response.setHeader("Connection","keep-alive");response.flushHeaders();response.write(`event: connected\ndata: ${JSON.stringify({connectedAt:new Date().toISOString()})}\n\n`);const unsubscribe=subscribePlatformChanges(event=>response.write(`event: change\ndata: ${JSON.stringify(event)}\n\n`));const heartbeat=setInterval(()=>response.write(`: heartbeat ${Date.now()}\n\n`),25000);request.on("close",()=>{clearInterval(heartbeat);unsubscribe()})};

const getStepUpAccess: RequestHandler = (request, response) => {
  if (!request.adminAuth) {
    throw new ApiError(401, "Admin authentication is required", "ADMIN_UNAUTHORIZED");
  }
  response.status(200).json({
    data: {
      stepUpAuthorized: true,
      verifiedAt: request.adminAuth.stepUpVerifiedAt,
    },
  });
};

export const adminDashboardController = {
  getAccessSummary,
  getMetrics,
  events,
  getStepUpAccess,
};
