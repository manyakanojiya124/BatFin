import { readFile } from "node:fs/promises";
import path from "node:path";

import { prisma } from "../src/database/prisma.js";
import { ApiError } from "../src/middleware/error.middleware.js";
import { adminMasterDataService } from "../src/modules/admin-master-data/admin-master-data.service.js";

const manifest: Record<string, string> = {
  branch_scheme_mapping: "branch-scheme-mapping-2026-08-19.csv",
  charge_master: "charge-master.csv",
  deliverable_settings: "deliverable-setting-2026-08-19.csv",
  insurance_types: "export (1).csv",
  field_visit_workflows: "export (2).csv",
  insurance_providers: "export.csv",
  lead_channels: "lead-channel-module-2026-08-19.csv",
  lms_deliverables: "lms-deliverable-2026-08-19.csv",
  collection_mis: "lms068_collection_mis_18082026162029.csv",
  quick_links: "quick-link-master-2026-08-19.csv",
  insurance_rates: "rate-master-configuration-2026-08-19.csv",
  repayment_start_date_rules: "repayment-start-date-configuration.csv",
  sanction_conditions: "sanction-master-2026-08-19.csv",
  scheme_charge_knockoff_mapping: "scheme-charge-knockoff-policy-mapping.csv",
  state_property_titles: "state-wise-property-title-2026-08-19.csv",
  staff_directory: "users.csv",
};

async function seed() {
  const directory = process.env.MASTER_DATA_SEED_DIRECTORY;
  const adminEmail = process.env.MASTER_DATA_SEED_ADMIN_EMAIL?.trim().toLowerCase();
  if (!directory || !adminEmail) {
    throw new Error(
      "Set MASTER_DATA_SEED_DIRECTORY and MASTER_DATA_SEED_ADMIN_EMAIL. The actor must already be a Super Admin.",
    );
  }
  const actor = await prisma.adminUser.findUnique({ where: { email: adminEmail } });
  if (!actor || actor.role !== "SUPER_ADMIN" || !["active", "invited"].includes(actor.status)) {
    throw new Error("MASTER_DATA_SEED_ADMIN_EMAIL must identify an active or invited Super Admin");
  }

  let inserted = 0;
  let skipped = 0;
  for (const [datasetType, fileName] of Object.entries(manifest)) {
    const filePath = path.resolve(directory, fileName);
    const buffer = await readFile(filePath);
    const file = {
      fieldname: "file",
      originalname: fileName,
      encoding: "7bit",
      mimetype: "text/csv",
      size: buffer.length,
      buffer,
    } as Express.Multer.File;
    try {
      const job = await adminMasterDataService.importFile(
        datasetType,
        file,
        "Governed seed import from supplied CSV bundle",
        actor.id,
        { ipAddress: null, userAgent: "BatFIN governed business-data seed CLI" },
      );
      inserted += job.insertedCount;
      console.log(
        `${datasetType}: completed (${job.sourceRowCount} rows, ${job.insertedCount} inserted, ${job.updatedCount} updated, ${job.unchangedCount} unchanged)`,
      );
    } catch (error) {
      if (error instanceof ApiError && error.code === "MASTER_DATA_IMPORT_DUPLICATE") {
        skipped += 1;
        console.log(`${datasetType}: exact completed source already present; skipped`);
        continue;
      }
      throw error;
    }
  }
  console.log(
    `Governed business-data seed complete: ${inserted} inserted records, ${skipped} duplicate files skipped.`,
  );
}

seed()
  .catch((error: unknown) => {
    console.error(
      "Unable to seed governed business data:",
      error instanceof Error ? error.message : "Unknown error",
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
