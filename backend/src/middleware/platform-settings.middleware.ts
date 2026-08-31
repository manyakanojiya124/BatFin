import type { RequestHandler } from "express";

import { getPlatformSettings } from "../config/platform-settings.js";
import { ApiError } from "./error.middleware.js";

export const enforcePlatformAvailability: RequestHandler = async (
  request,
  _response,
  next,
) => {
  if (request.path.startsWith("/admin")) {
    next();
    return;
  }
  const settings = await getPlatformSettings();
  if (settings.maintenanceMode) {
    next(
      new ApiError(
        503,
        "BatFIN customer services are temporarily unavailable for scheduled maintenance",
        "PLATFORM_MAINTENANCE",
      ),
    );
    return;
  }
  next();
};
