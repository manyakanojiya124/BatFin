import { PrismaClient } from "@prisma/client";

import {
  createTotpSecret,
  encryptAdminSecret,
  hashAdminSecret,
  normalizeAdminEmail,
  validateAdminPassword,
} from "../src/config/admin-security.js";

const prisma = new PrismaClient();

async function bootstrap() {
  const emailValue = process.env.ADMIN_BOOTSTRAP_EMAIL;
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;
  const name = process.env.ADMIN_BOOTSTRAP_NAME?.trim() || "BatFIN Super Admin";
  const force = process.env.ADMIN_BOOTSTRAP_FORCE === "true";

  if (!emailValue || !password) {
    throw new Error(
      "Set ADMIN_BOOTSTRAP_EMAIL and ADMIN_BOOTSTRAP_PASSWORD in the command environment",
    );
  }

  const email = normalizeAdminEmail(emailValue);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL must be a valid email address");
  }

  const passwordError = validateAdminPassword(password);
  if (passwordError) throw new Error(passwordError);

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing && !force) {
    throw new Error(
      "An admin with this email already exists. Set ADMIN_BOOTSTRAP_FORCE=true only if an intentional credential reset is required.",
    );
  }

  const passwordHash = await hashAdminSecret(password);
  const totpSecret = createTotpSecret();
  const totpSecretEncrypted = encryptAdminSecret(totpSecret);

  const admin = await prisma.$transaction(async (transaction) => {
    if (existing) {
      await transaction.adminSession.deleteMany({
        where: { adminUserId: existing.id },
      });
      await transaction.adminLoginChallenge.deleteMany({
        where: { adminUserId: existing.id },
      });
      await transaction.adminBackupCode.deleteMany({
        where: { adminUserId: existing.id },
      });
    }

    const adminUser = await transaction.adminUser.upsert({
      where: { email },
      update: {
        name,
        passwordHash,
        role: "SUPER_ADMIN",
        status: "invited",
        totpSecretEncrypted,
        totpVerifiedAt: null,
        failedLoginAttempts: 0,
        lockedUntil: null,
        mustChangePassword: true,
        passwordChangedAt: null,
        invitedByAdminId: null,
        invitedAt: new Date(),
        credentialsResetAt: new Date(),
      },
      create: {
        name,
        email,
        passwordHash,
        role: "SUPER_ADMIN",
        status: "invited",
        totpSecretEncrypted,
        mustChangePassword: true,
        invitedAt: new Date(),
      },
    });

    await transaction.adminAuditLog.create({
      data: {
        adminUserId: adminUser.id,
        action: existing
          ? "SUPER_ADMIN_BOOTSTRAP_RESET"
          : "SUPER_ADMIN_BOOTSTRAPPED",
        resourceType: "AdminUser",
        resourceId: adminUser.id,
        metadata: { email, force },
      },
    });

    return adminUser;
  });

  console.log("BatFIN Super Admin bootstrap completed.");
  console.log(`Admin ID: ${admin.id}`);
  console.log(`Email: ${admin.email}`);
  console.log("Role: SUPER_ADMIN");
  console.log("Status: invited (activates after first valid TOTP)");
  // Never print TOTP seeds or enrollment URIs. The authenticated challenge flow
  // presents a one-time enrollment QR after the correct password is verified.
  console.log(
    "Sign in through the admin portal. The setup QR is shown only after the correct password is entered.",
  );
}

bootstrap()
  .catch((error: unknown) => {
    console.error("Unable to bootstrap Super Admin:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
