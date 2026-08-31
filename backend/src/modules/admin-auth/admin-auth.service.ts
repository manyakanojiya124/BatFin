import type { AdminUser } from "@prisma/client";

import {
  createBackupCodes,
  createOpaqueToken,
  createTotpUri,
  decryptAdminSecret,
  hashAdminSecret,
  hashOpaqueToken,
  normalizeAdminEmail,
  validateAdminPassword,
  verifyAdminSecret,
  verifyTotpCode,
} from "../../config/admin-security.js";
import { env } from "../../config/env.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";

const LOGIN_CHALLENGE_MINUTES = 5;
const MAX_CHALLENGE_ATTEMPTS = 5;
const MAX_LOGIN_FAILURES = 5;
const ACCOUNT_LOCK_MINUTES = 15;
const STEP_UP_MINUTES = 5;

const publicAdminSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  mustChangePassword: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export type PublicAdmin = Pick<
  AdminUser,
  | "id"
  | "name"
  | "email"
  | "role"
  | "status"
  | "mustChangePassword"
  | "lastLoginAt"
  | "createdAt"
  | "updatedAt"
>;

export interface AdminRequestContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

const dummyPasswordHashPromise = hashAdminSecret(
  "BatFIN-Dummy-Password-For-Timing-Only!",
);

function validateEmail(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Email and password are required", "VALIDATION_ERROR");
  }
  const email = normalizeAdminEmail(value);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid admin email", "VALIDATION_ERROR");
  }
  return email;
}

function validatePasswordInput(value: unknown) {
  if (typeof value !== "string" || value.length === 0 || value.length > 128) {
    throw new ApiError(400, "Email and password are required", "VALIDATION_ERROR");
  }
  return value;
}

function validateChallengeToken(value: unknown) {
  if (typeof value !== "string" || value.length < 32 || value.length > 256) {
    throw new ApiError(400, "A valid login challenge is required", "VALIDATION_ERROR");
  }
  return value;
}

function validateMfaCode(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Enter an authenticator or backup code", "VALIDATION_ERROR");
  }
  const code = value.trim().toUpperCase();
  if (!/^\d{6}$/.test(code) && !/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/.test(code)) {
    throw new ApiError(400, "Enter a valid authenticator or backup code", "VALIDATION_ERROR");
  }
  return code;
}

function adminIsLoginEligible(status: string) {
  return status === "active" || status === "invited";
}

async function recordLoginFailure(admin: AdminUser) {
  const failures = admin.failedLoginAttempts + 1;
  const lockedUntil =
    failures >= MAX_LOGIN_FAILURES
      ? new Date(Date.now() + ACCOUNT_LOCK_MINUTES * 60 * 1000)
      : null;

  await prisma.adminUser.update({
    where: { id: admin.id },
    data: {
      failedLoginAttempts: failures >= MAX_LOGIN_FAILURES ? 0 : failures,
      lockedUntil,
    },
  });
}

async function beginLogin(
  input: { email?: unknown; password?: unknown },
  context: AdminRequestContext,
) {
  const email = validateEmail(input.email);
  const password = validatePasswordInput(input.password);
  const admin = await prisma.adminUser.findUnique({ where: { email } });

  if (!admin) {
    await verifyAdminSecret(await dummyPasswordHashPromise, password);
    await recordAdminAudit({
      action: "ADMIN_LOGIN_REJECTED",
      resourceType: "AdminUser",
      metadata: { email, reason: "invalid_credentials" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(401, "Invalid admin credentials", "INVALID_ADMIN_CREDENTIALS");
  }

  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    await recordAdminAudit({
      adminUserId: admin.id,
      action: "ADMIN_LOGIN_REJECTED",
      resourceType: "AdminUser",
      resourceId: admin.id,
      metadata: { reason: "account_locked" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(
      429,
      "This admin account is temporarily locked. Try again later.",
      "ADMIN_ACCOUNT_LOCKED",
    );
  }

  if (!adminIsLoginEligible(admin.status)) {
    await recordAdminAudit({
      adminUserId: admin.id,
      action: "ADMIN_LOGIN_REJECTED",
      resourceType: "AdminUser",
      resourceId: admin.id,
      metadata: { reason: "account_disabled" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(403, "Admin account is not active", "ADMIN_ACCOUNT_DISABLED");
  }

  const passwordMatches = await verifyAdminSecret(admin.passwordHash, password);
  if (!passwordMatches) {
    await recordLoginFailure(admin);
    await recordAdminAudit({
      adminUserId: admin.id,
      action: "ADMIN_LOGIN_REJECTED",
      resourceType: "AdminUser",
      resourceId: admin.id,
      metadata: { reason: "invalid_credentials" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(401, "Invalid admin credentials", "INVALID_ADMIN_CREDENTIALS");
  }

  if (!admin.totpSecretEncrypted) {
    throw new ApiError(
      409,
      "Admin MFA setup is incomplete",
      "ADMIN_MFA_NOT_CONFIGURED",
    );
  }

  const challengeToken = createOpaqueToken();
  const expiresAt = new Date(
    Date.now() + LOGIN_CHALLENGE_MINUTES * 60 * 1000,
  );

  await prisma.$transaction([
    prisma.adminLoginChallenge.deleteMany({
      where: {
        adminUserId: admin.id,
        consumedAt: null,
      },
    }),
    prisma.adminLoginChallenge.create({
      data: {
        adminUserId: admin.id,
        tokenHash: hashOpaqueToken(challengeToken),
        expiresAt,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    }),
  ]);

  await recordAdminAudit({
    adminUserId: admin.id,
    action: "ADMIN_PASSWORD_VERIFIED",
    resourceType: "AdminUser",
    resourceId: admin.id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  const mfaSetupRequired = admin.totpVerifiedAt === null;
  const secret = mfaSetupRequired
    ? decryptAdminSecret(admin.totpSecretEncrypted)
    : null;

  return {
    challengeToken,
    expiresAt,
    mfaSetupRequired,
    ...(secret
      ? {
          totpSetup: {
            secret,
            otpauthUri: createTotpUri(admin.email, secret),
          },
        }
      : {}),
  };
}

async function findBackupCode(adminUserId: string, code: string) {
  const backupCodes = await prisma.adminBackupCode.findMany({
    where: { adminUserId, usedAt: null },
    orderBy: { createdAt: "asc" },
  });

  for (const backupCode of backupCodes) {
    if (await verifyAdminSecret(backupCode.codeHash, code)) {
      return backupCode.id;
    }
  }
  return null;
}

async function verifyMfa(
  input: { challengeToken?: unknown; code?: unknown },
  context: AdminRequestContext,
) {
  const challengeToken = validateChallengeToken(input.challengeToken);
  const code = validateMfaCode(input.code);
  const challenge = await prisma.adminLoginChallenge.findUnique({
    where: { tokenHash: hashOpaqueToken(challengeToken) },
    include: { adminUser: true },
  });

  if (
    !challenge ||
    challenge.consumedAt ||
    challenge.expiresAt <= new Date() ||
    challenge.attempts >= MAX_CHALLENGE_ATTEMPTS
  ) {
    throw new ApiError(
      401,
      "The admin login challenge is invalid or expired",
      "INVALID_ADMIN_CHALLENGE",
    );
  }

  const admin = challenge.adminUser;
  if (!adminIsLoginEligible(admin.status) || !admin.totpSecretEncrypted) {
    throw new ApiError(403, "Admin account is not active", "ADMIN_ACCOUNT_DISABLED");
  }

  const secret = decryptAdminSecret(admin.totpSecretEncrypted);
  const isTotp = /^\d{6}$/.test(code);
  const backupCodeId =
    !isTotp && admin.totpVerifiedAt
      ? await findBackupCode(admin.id, code)
      : null;
  const verified = isTotp
    ? verifyTotpCode(secret, code)
    : backupCodeId !== null;

  if (!verified) {
    await prisma.adminLoginChallenge.update({
      where: { id: challenge.id },
      data: { attempts: { increment: 1 } },
    });
    await recordAdminAudit({
      adminUserId: admin.id,
      action: "ADMIN_MFA_REJECTED",
      resourceType: "AdminUser",
      resourceId: admin.id,
      metadata: { method: isTotp ? "totp" : "backup_code" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(401, "The verification code is incorrect", "INVALID_ADMIN_MFA");
  }

  const firstTotpVerification = admin.totpVerifiedAt === null;
  const backupCodes = firstTotpVerification ? createBackupCodes() : [];
  const backupCodeHashes: string[] = [];
  for (const backupCode of backupCodes) {
    backupCodeHashes.push(await hashAdminSecret(backupCode));
  }

  const sessionToken = createOpaqueToken();
  const csrfToken = createOpaqueToken();
  const sessionExpiresAt = new Date(
    Date.now() + env.adminSessionHours * 60 * 60 * 1000,
  );

  await prisma.$transaction(async (transaction) => {
    await transaction.adminLoginChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() },
    });
    if (backupCodeId) {
      await transaction.adminBackupCode.update({
        where: { id: backupCodeId },
        data: { usedAt: new Date() },
      });
    }
    await transaction.adminUser.update({
      where: { id: admin.id },
      data: {
        status: "active",
        ...(firstTotpVerification ? { totpVerifiedAt: new Date() } : {}),
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
    if (firstTotpVerification) {
      await transaction.adminBackupCode.deleteMany({
        where: { adminUserId: admin.id },
      });
      await transaction.adminBackupCode.createMany({
        data: backupCodeHashes.map((codeHash) => ({
          adminUserId: admin.id,
          codeHash,
        })),
      });
    }
    await transaction.adminSession.create({
      data: {
        adminUserId: admin.id,
        sessionTokenHash: hashOpaqueToken(sessionToken),
        csrfTokenHash: hashOpaqueToken(csrfToken),
        expiresAt: sessionExpiresAt,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
  });

  await recordAdminAudit({
    adminUserId: admin.id,
    action: "ADMIN_LOGIN_SUCCEEDED",
    resourceType: "AdminUser",
    resourceId: admin.id,
    metadata: {
      method: isTotp ? "totp" : "backup_code",
      firstTotpVerification,
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  const refreshedAdmin = await prisma.adminUser.findUniqueOrThrow({
    where: { id: admin.id },
    select: publicAdminSelect,
  });

  return {
    sessionToken,
    csrfToken,
    sessionExpiresAt,
    admin: refreshedAdmin,
    backupCodes,
  };
}

async function getMe(adminUserId: string) {
  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
    select: publicAdminSelect,
  });
  if (!admin) {
    throw new ApiError(401, "Admin session is invalid", "INVALID_ADMIN_SESSION");
  }
  return admin;
}

async function rotateCsrf(sessionId: string) {
  const csrfToken = createOpaqueToken();
  await prisma.adminSession.update({
    where: { id: sessionId },
    data: { csrfTokenHash: hashOpaqueToken(csrfToken) },
  });
  return csrfToken;
}

async function stepUp(
  adminUserId: string,
  sessionId: string,
  codeValue: unknown,
  context: AdminRequestContext,
) {
  const code = validateMfaCode(codeValue);
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError(400, "Step-up requires an authenticator code", "TOTP_REQUIRED");
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
  });
  if (!admin?.totpSecretEncrypted) {
    throw new ApiError(401, "Admin MFA is not configured", "ADMIN_MFA_NOT_CONFIGURED");
  }

  const verified = verifyTotpCode(
    decryptAdminSecret(admin.totpSecretEncrypted),
    code,
  );
  if (!verified) {
    await recordAdminAudit({
      adminUserId,
      action: "ADMIN_STEP_UP_REJECTED",
      resourceType: "AdminSession",
      resourceId: sessionId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(401, "The authenticator code is incorrect", "INVALID_ADMIN_MFA");
  }

  const verifiedAt = new Date();
  await prisma.adminSession.update({
    where: { id: sessionId },
    data: { stepUpVerifiedAt: verifiedAt },
  });
  await recordAdminAudit({
    adminUserId,
    action: "ADMIN_STEP_UP_SUCCEEDED",
    resourceType: "AdminSession",
    resourceId: sessionId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return {
    verifiedAt,
    validForSeconds: STEP_UP_MINUTES * 60,
  };
}

async function changePassword(
  adminUserId: string,
  currentSessionId: string,
  input: { currentPassword?: unknown; newPassword?: unknown },
  context: AdminRequestContext,
) {
  const currentPassword = validatePasswordInput(input.currentPassword);
  const newPassword = validatePasswordInput(input.newPassword);
  const validationError = validateAdminPassword(newPassword);
  if (validationError) {
    throw new ApiError(400, validationError, "WEAK_ADMIN_PASSWORD");
  }
  if (currentPassword === newPassword) {
    throw new ApiError(
      400,
      "New password must differ from the current password",
      "PASSWORD_REUSE_NOT_ALLOWED",
    );
  }

  const admin = await prisma.adminUser.findUnique({
    where: { id: adminUserId },
  });
  if (!admin || !(await verifyAdminSecret(admin.passwordHash, currentPassword))) {
    await recordAdminAudit({
      adminUserId,
      action: "ADMIN_PASSWORD_CHANGE_REJECTED",
      resourceType: "AdminUser",
      resourceId: adminUserId,
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(401, "Current password is incorrect", "INVALID_CURRENT_PASSWORD");
  }

  const passwordHash = await hashAdminSecret(newPassword);
  await prisma.$transaction([
    prisma.adminUser.update({
      where: { id: adminUserId },
      data: {
        passwordHash,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      },
    }),
    prisma.adminSession.updateMany({
      where: {
        adminUserId,
        id: { not: currentSessionId },
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
        revokedByAdminId: adminUserId,
        revocationReason: "Administrator password changed",
      },
    }),
  ]);

  await recordAdminAudit({
    adminUserId,
    action: "ADMIN_PASSWORD_CHANGED",
    resourceType: "AdminUser",
    resourceId: adminUserId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return getMe(adminUserId);
}

async function logout(
  adminUserId: string,
  sessionId: string,
  context: AdminRequestContext,
) {
  await prisma.adminSession.updateMany({
    where: { id: sessionId, adminUserId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedByAdminId: adminUserId,
      revocationReason: "Administrator signed out from this session",
    },
  });
  await recordAdminAudit({
    adminUserId,
    action: "ADMIN_LOGOUT",
    resourceType: "AdminSession",
    resourceId: sessionId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
}

async function revokeAllSessions(
  adminUserId: string,
  context: AdminRequestContext,
) {
  const result = await prisma.adminSession.updateMany({
    where: { adminUserId, revokedAt: null },
    data: {
      revokedAt: new Date(),
      revokedByAdminId: adminUserId,
      revocationReason: "Administrator revoked all personal sessions",
    },
  });
  await recordAdminAudit({
    adminUserId,
    action: "ADMIN_SESSIONS_REVOKED",
    resourceType: "AdminUser",
    resourceId: adminUserId,
    metadata: { revokedCount: result.count },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return result.count;
}

export const adminAuthService = {
  beginLogin,
  verifyMfa,
  getMe,
  rotateCsrf,
  stepUp,
  changePassword,
  logout,
  revokeAllSessions,
};
