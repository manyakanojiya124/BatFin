import { createHash } from "node:crypto";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { basename, extname, resolve } from "node:path";
import { prisma } from "../src/database/prisma.js";
import { adminAnalyticsService } from "../src/modules/admin-analytics/admin-analytics.service.js";
import { analyticsProcessingWorker } from "../src/modules/admin-analytics/analytics-processing.worker.js";

const sourcePath = resolve(process.argv[2] ?? "tests/fixtures/portfolio-synthetic.csv");
const adminEmail = process.env.ANALYTICS_FIXTURE_ADMIN_EMAIL ?? "superadmin@batfin.local";
const force = process.env.ANALYTICS_FIXTURE_FORCE === "true";

async function waitForDiscovery(datasetId: string) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const dataset = await prisma.analyticsDataset.findUnique({ where: { id: datasetId } });
    if (!dataset) throw new Error("Fixture dataset disappeared during processing");
    if (dataset.status === "FAILED") throw new Error(dataset.failureMessage ?? "Fixture processing failed");
    if (!analyticsProcessingWorker.isRunning(datasetId) && ["ANALYZING", "READY"].includes(dataset.status)) return dataset;
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("Timed out while profiling the analytics fixture");
}

async function main() {
  const admin = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!admin) throw new Error(`Admin account ${adminEmail} was not found`);
  const buffer = readFileSync(sourcePath);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  const existing = await prisma.analyticsDataset.findFirst({
    where: { ownerAdminId: admin.id, deletedAt: null, files: { some: { sha256, isCurrent: true, deletedAt: null } } },
    orderBy: { createdAt: "desc" },
  });
  if (existing?.status === "READY" && !force) {
    const dashboard = await prisma.analyticsDashboard.findFirst({ where: { datasetId: existing.id, deletedAt: null, currentVersionId: { not: null } } });
    if (dashboard) {
      console.log(`Analytics regression fixture is already ready (${existing.id}).`);
      return;
    }
  }
  if (existing && force) {
    await adminAnalyticsService.remove(existing.id, admin.id, "Reimporting the governed analytics regression fixture", { ipAddress: null, userAgent: "analytics-fixture-import" });
  }
  const stat = statSync(sourcePath);
  const file: Express.Multer.File = {
    fieldname: "file",
    originalname: basename(sourcePath),
    encoding: "7bit",
    mimetype: extname(sourcePath).toLowerCase() === ".csv" ? "text/csv" : "application/octet-stream",
    size: stat.size,
    destination: "",
    filename: basename(sourcePath),
    path: sourcePath,
    buffer,
    stream: createReadStream(sourcePath),
  };
  const uploaded = await adminAnalyticsService.upload(admin.id, file, {
    name: "BatFIN Portfolio Summary July 2026",
    description: "Primary regression fixture for the universal analytics engine.",
  }, { ipAddress: null, userAgent: "analytics-fixture-import" });
  const datasetId = uploaded.dataset.id;
  const discovered = await waitForDiscovery(datasetId);
  if (discovered.status !== "READY") {
    // Semantic processing also generates and preflights the first dashboard.
    await analyticsProcessingWorker.semanticModelNow(datasetId);
  }
  const dataset = await prisma.analyticsDataset.findUniqueOrThrow({ where: { id: datasetId } });
  const dashboard = await prisma.analyticsDashboard.findFirst({ where: { datasetId, deletedAt: null }, include: { currentVersion: true } });
  console.log(`Imported analytics fixture ${dataset.id}: ${dataset.rowCount} normalized rows, ${dataset.columnCount} columns, dashboard version ${dashboard?.currentVersion?.version ?? 0}.`);
}

main().catch((error: unknown) => {
  console.error("Analytics fixture import failed:", error instanceof Error ? error.message : "Unknown error");
  process.exitCode = 1;
}).finally(async () => {
  await prisma.$disconnect();
});
