import type { Server } from "node:http";

import { app } from "./app.js";
import { env } from "./config/env.js";
import { prisma } from "./database/prisma.js";
import { adminAnalyticsService } from "./modules/admin-analytics/admin-analytics.service.js";
import { analyticsProcessingWorker } from "./modules/admin-analytics/analytics-processing.worker.js";

let server: Server | null = null;

async function start() {
  const recoveredUploads = await adminAnalyticsService.recoverStaleUploads();
  if (recoveredUploads > 0) {
    console.log(`Recovered ${recoveredUploads} interrupted analytics upload(s)`);
  }
  const resumedAnalyticsTasks =
    await analyticsProcessingWorker.recoverPendingWork();
  if (resumedAnalyticsTasks > 0) {
    console.log(`Resumed ${resumedAnalyticsTasks} analytics processing task(s)`);
  }
  server = app.listen(env.port, "0.0.0.0", () => {
    console.log(`BatFIN API listening on port ${env.port}`);
  });
}

async function shutdown(signal: string) {
  console.log(`${signal} received, shutting down`);
  if (!server) {
    await prisma.$disconnect();
    process.exit(0);
  }
  server.close(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

void start().catch(async (error: unknown) => {
  console.error(
    "Unable to start BatFIN API:",
    error instanceof Error ? error.message : "Unknown error",
  );
  await prisma.$disconnect();
  process.exit(1);
});
