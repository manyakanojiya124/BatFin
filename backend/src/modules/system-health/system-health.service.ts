import { prisma } from "../../database/prisma.js";

async function readiness() {
  await prisma.$queryRaw`SELECT 1`;
  return { status: "ready", database: "reachable", checkedAt: new Date() };
}

function liveness() {
  return { status: "ok", uptimeSeconds: Math.floor(process.uptime()), checkedAt: new Date() };
}

export const systemHealthService = { liveness, readiness };
