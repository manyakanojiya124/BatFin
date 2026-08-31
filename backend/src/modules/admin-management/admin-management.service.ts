import { randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";

import {
  ADMIN_ROLES,
  ROLE_PERMISSIONS,
  type AdminRole,
} from "../../config/admin-permissions.js";
import {
  createTotpSecret,
  encryptAdminSecret,
  hashAdminSecret,
  normalizeAdminEmail,
} from "../../config/admin-security.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";

const adminStatuses = ["invited", "active", "suspended", "disabled"] as const;
const manageableStatuses = ["active", "suspended", "disabled"] as const;
const sessionStatuses = ["active", "revoked", "expired"] as const;

const publicAdminSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  mustChangePassword: true,
  totpVerifiedAt: true,
  failedLoginAttempts: true,
  lockedUntil: true,
  passwordChangedAt: true,
  lastLoginAt: true,
  invitedByAdminId: true,
  invitedAt: true,
  credentialsResetAt: true,
  createdAt: true,
  updatedAt: true,
  invitedBy: {
    select: { id: true, name: true, email: true },
  },
} as const;

const sessionSelect = {
  id: true,
  adminUserId: true,
  expiresAt: true,
  stepUpVerifiedAt: true,
  lastSeenAt: true,
  revokedAt: true,
  revokedByAdminId: true,
  revocationReason: true,
  ipAddress: true,
  userAgent: true,
  createdAt: true,
  adminUser: {
    select: { id: true, name: true, email: true, role: true, status: true },
  },
  revokedBy: {
    select: { id: true, name: true, email: true },
  },
} as const;

type ListInput = {
  q?: unknown;
  role?: unknown;
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

type SessionListInput = {
  q?: unknown;
  adminUserId?: unknown;
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

function boundedText(value: unknown, label: string, minimum: number, maximum: number) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ApiError(
      400,
      `${label} must be between ${minimum} and ${maximum} characters`,
      "VALIDATION_ERROR",
    );
  }
  return normalized;
}

function optionalText(value: unknown, maximum = 100) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "Search query must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ApiError(400, "Search query is too long", "VALIDATION_ERROR");
  }
  return normalized || undefined;
}

function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || value.length < 1 || value.length > 100) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

function positiveInteger(value: unknown, fallback: number, maximum: number) {
  if (value === undefined || value === "") return fallback;
  const parsed = typeof value === "string" ? Number(value) : value;
  if (
    typeof parsed !== "number" ||
    !Number.isInteger(parsed) ||
    parsed < 1 ||
    parsed > maximum
  ) {
    throw new ApiError(400, "Invalid pagination value", "VALIDATION_ERROR");
  }
  return parsed;
}

function enumValue<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
  optional = false,
) {
  if ((value === undefined || value === "") && optional) return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  const normalized = value.trim().toUpperCase();
  const result = allowed.find((entry) => entry.toUpperCase() === normalized);
  if (!result) {
    throw new ApiError(400, `Invalid ${label}`, "VALIDATION_ERROR");
  }
  return result as T[number];
}

function emailAddress(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Email is required", "VALIDATION_ERROR");
  }
  const email = normalizeAdminEmail(value);
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid admin email", "VALIDATION_ERROR");
  }
  return email;
}

function temporaryPassword() {
  return `Bf!9-${randomBytes(18).toString("base64url")}`;
}

function sessionState(session: {
  revokedAt: Date | null;
  expiresAt: Date;
}) {
  if (session.revokedAt) return "revoked" as const;
  if (session.expiresAt <= new Date()) return "expired" as const;
  return "active" as const;
}

async function ensureAnotherActiveSuperAdmin(
  transaction: Prisma.TransactionClient,
  excludedAdminId: string,
) {
  const count = await transaction.adminUser.count({
    where: {
      id: { not: excludedAdminId },
      role: "SUPER_ADMIN",
      status: "active",
    },
  });
  if (count < 1) {
    throw new ApiError(
      409,
      "The last active Super Admin cannot be demoted or deactivated",
      "LAST_ACTIVE_SUPER_ADMIN",
    );
  }
}

async function list(input: ListInput) {
  const q = optionalText(input.q);
  const role = enumValue(input.role, ADMIN_ROLES, "role", true);
  const status = enumValue(input.status, adminStatuses, "status", true);
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 20, 100);
  const where: Prisma.AdminUserWhereInput = {
    ...(role ? { role } : {}),
    ...(status ? { status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { id: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };
  const now = new Date();
  const [admins, total] = await Promise.all([
    prisma.adminUser.findMany({
      where,
      select: {
        ...publicAdminSelect,
        sessions: {
          where: { revokedAt: null, expiresAt: { gt: now } },
          select: { id: true },
        },
        backupCodes: {
          where: { usedAt: null },
          select: { id: true },
        },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminUser.count({ where }),
  ]);
  return {
    admins: admins.map(({ sessions, backupCodes, ...admin }) => ({
      ...admin,
      permissions: ROLE_PERMISSIONS[admin.role as AdminRole] ?? [],
      activeSessionCount: sessions.length,
      unusedBackupCodeCount: backupCodes.length,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getSummary() {
  const now = new Date();
  const [total, statusGroups, roleGroups, activeSessions, lockedAccounts] =
    await Promise.all([
      prisma.adminUser.count(),
      prisma.adminUser.groupBy({ by: ["status"], _count: { _all: true } }),
      prisma.adminUser.groupBy({ by: ["role"], _count: { _all: true } }),
      prisma.adminSession.count({
        where: { revokedAt: null, expiresAt: { gt: now } },
      }),
      prisma.adminUser.count({ where: { lockedUntil: { gt: now } } }),
    ]);
  return {
    total,
    active: statusGroups.find((group) => group.status === "active")?._count._all ?? 0,
    invited: statusGroups.find((group) => group.status === "invited")?._count._all ?? 0,
    suspended: statusGroups.find((group) => group.status === "suspended")?._count._all ?? 0,
    disabled: statusGroups.find((group) => group.status === "disabled")?._count._all ?? 0,
    activeSessions,
    lockedAccounts,
    roles: Object.fromEntries(
      roleGroups.map((group) => [group.role, group._count._all]),
    ),
  };
}

async function getById(
  idValue: unknown,
  actingAdminId: string,
  context: AdminRequestContext,
) {
  const id = requiredId(idValue, "Administrator ID");
  const now = new Date();
  const admin = await prisma.adminUser.findUnique({
    where: { id },
    select: {
      ...publicAdminSelect,
      sessions: {
        select: sessionSelect,
        orderBy: [{ createdAt: "desc" }],
        take: 25,
      },
      backupCodes: { select: { id: true, usedAt: true, createdAt: true } },
    },
  });
  if (!admin) {
    throw new ApiError(404, "Administrator not found", "ADMIN_USER_NOT_FOUND");
  }
  await recordAdminAudit({
    adminUserId: actingAdminId,
    action: "ADMIN_ACCOUNT_VIEWED",
    resourceType: "AdminUser",
    resourceId: id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return {
    ...admin,
    permissions: ROLE_PERMISSIONS[admin.role as AdminRole] ?? [],
    sessions: admin.sessions.map((session) => ({
      ...session,
      state: session.revokedAt
        ? "revoked"
        : session.expiresAt <= now
          ? "expired"
          : "active",
    })),
    backupCodes: {
      total: admin.backupCodes.length,
      unused: admin.backupCodes.filter((code) => !code.usedAt).length,
      used: admin.backupCodes.filter((code) => code.usedAt).length,
    },
  };
}

async function invite(
  actingAdminId: string,
  input: { name?: unknown; email?: unknown; role?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const name = boundedText(input.name, "Name", 2, 80);
  const email = emailAddress(input.email);
  const role = enumValue(input.role, ADMIN_ROLES, "role")!;
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const password = temporaryPassword();
  const passwordHash = await hashAdminSecret(password);
  const totpSecretEncrypted = encryptAdminSecret(createTotpSecret());
  const now = new Date();

  const admin = await prisma.$transaction(async (transaction) => {
    const existing = await transaction.adminUser.findUnique({ where: { email } });
    if (existing) {
      throw new ApiError(
        409,
        "An administrator with this email already exists",
        "ADMIN_EMAIL_EXISTS",
      );
    }
    const created = await transaction.adminUser.create({
      data: {
        name,
        email,
        role,
        status: "invited",
        passwordHash,
        totpSecretEncrypted,
        mustChangePassword: true,
        invitedByAdminId: actingAdminId,
        invitedAt: now,
      },
      select: publicAdminSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "ADMIN_ACCOUNT_INVITED",
        resourceType: "AdminUser",
        resourceId: created.id,
        metadata: { email, role, reason },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return created;
  });
  return { admin, temporaryPassword: password };
}

async function updateRole(
  idValue: unknown,
  actingAdminId: string,
  input: { role?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const id = requiredId(idValue, "Administrator ID");
  if (id === actingAdminId) {
    throw new ApiError(409, "You cannot change your own role", "SELF_ADMIN_MUTATION_REJECTED");
  }
  const role = enumValue(input.role, ADMIN_ROLES, "role")!;
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.adminUser.findUnique({ where: { id } });
    if (!current) {
      throw new ApiError(404, "Administrator not found", "ADMIN_USER_NOT_FOUND");
    }
    if (current.role === role) {
      throw new ApiError(409, "Administrator role is unchanged", "ADMIN_ROLE_UNCHANGED");
    }
    if (current.role === "SUPER_ADMIN" && current.status === "active") {
      await ensureAnotherActiveSuperAdmin(transaction, id);
    }
    const updated = await transaction.adminUser.update({
      where: { id },
      data: { role },
      select: publicAdminSelect,
    });
    const revoked = await transaction.adminSession.updateMany({
      where: { adminUserId: id, revokedAt: null },
      data: {
        revokedAt: now,
        revokedByAdminId: actingAdminId,
        revocationReason: reason,
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "ADMIN_ROLE_CHANGED",
        resourceType: "AdminUser",
        resourceId: id,
        metadata: {
          reason,
          previousRole: current.role,
          newRole: role,
          revokedSessionCount: revoked.count,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

async function updateStatus(
  idValue: unknown,
  actingAdminId: string,
  input: { status?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const id = requiredId(idValue, "Administrator ID");
  if (id === actingAdminId) {
    throw new ApiError(409, "You cannot change your own status", "SELF_ADMIN_MUTATION_REJECTED");
  }
  const requested = enumValue(input.status, manageableStatuses, "status")!;
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const current = await transaction.adminUser.findUnique({ where: { id } });
    if (!current) {
      throw new ApiError(404, "Administrator not found", "ADMIN_USER_NOT_FOUND");
    }
    const status =
      requested === "active" && !current.totpVerifiedAt ? "invited" : requested;
    if (current.status === status) {
      throw new ApiError(409, "Administrator status is unchanged", "ADMIN_STATUS_UNCHANGED");
    }
    if (
      current.role === "SUPER_ADMIN" &&
      current.status === "active" &&
      status !== "active"
    ) {
      await ensureAnotherActiveSuperAdmin(transaction, id);
    }
    const updated = await transaction.adminUser.update({
      where: { id },
      data: {
        status,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: publicAdminSelect,
    });
    const revoked =
      status === "suspended" || status === "disabled"
        ? await transaction.adminSession.updateMany({
            where: { adminUserId: id, revokedAt: null },
            data: {
              revokedAt: now,
              revokedByAdminId: actingAdminId,
              revocationReason: reason,
            },
          })
        : { count: 0 };
    if (status === "suspended" || status === "disabled") {
      await transaction.adminLoginChallenge.updateMany({
        where: { adminUserId: id, consumedAt: null },
        data: { consumedAt: now },
      });
    }
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "ADMIN_STATUS_CHANGED",
        resourceType: "AdminUser",
        resourceId: id,
        metadata: {
          reason,
          previousStatus: current.status,
          requestedStatus: requested,
          newStatus: status,
          revokedSessionCount: revoked.count,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

async function resetCredentials(
  idValue: unknown,
  actingAdminId: string,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const id = requiredId(idValue, "Administrator ID");
  if (id === actingAdminId) {
    throw new ApiError(
      409,
      "Use the bootstrap recovery command for your own credential reset",
      "SELF_ADMIN_MUTATION_REJECTED",
    );
  }
  const reason = boundedText(reasonValue, "Audit reason", 10, 500);
  const password = temporaryPassword();
  const passwordHash = await hashAdminSecret(password);
  const totpSecretEncrypted = encryptAdminSecret(createTotpSecret());
  const now = new Date();
  const admin = await prisma.$transaction(async (transaction) => {
    const current = await transaction.adminUser.findUnique({ where: { id } });
    if (!current) {
      throw new ApiError(404, "Administrator not found", "ADMIN_USER_NOT_FOUND");
    }
    await transaction.adminSession.updateMany({
      where: { adminUserId: id, revokedAt: null },
      data: {
        revokedAt: now,
        revokedByAdminId: actingAdminId,
        revocationReason: reason,
      },
    });
    await transaction.adminLoginChallenge.deleteMany({ where: { adminUserId: id } });
    await transaction.adminBackupCode.deleteMany({ where: { adminUserId: id } });
    const updated = await transaction.adminUser.update({
      where: { id },
      data: {
        passwordHash,
        totpSecretEncrypted,
        totpVerifiedAt: null,
        status: "invited",
        mustChangePassword: true,
        passwordChangedAt: null,
        credentialsResetAt: now,
        invitedAt: now,
        invitedByAdminId: actingAdminId,
        failedLoginAttempts: 0,
        lockedUntil: null,
      },
      select: publicAdminSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "ADMIN_CREDENTIALS_RESET",
        resourceType: "AdminUser",
        resourceId: id,
        metadata: { reason, previousStatus: current.status },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
  return { admin, temporaryPassword: password };
}

async function listSessions(
  input: SessionListInput,
  currentSessionId: string,
) {
  const q = optionalText(input.q);
  const adminUserId = optionalText(input.adminUserId);
  const status = enumValue(input.status, sessionStatuses, "session status", true);
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 25, 100);
  const now = new Date();
  const where: Prisma.AdminSessionWhereInput = {
    ...(adminUserId ? { adminUserId } : {}),
    ...(status === "active"
      ? { revokedAt: null, expiresAt: { gt: now } }
      : status === "revoked"
        ? { revokedAt: { not: null } }
        : status === "expired"
          ? { revokedAt: null, expiresAt: { lte: now } }
          : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { ipAddress: { contains: q, mode: "insensitive" } },
            { userAgent: { contains: q, mode: "insensitive" } },
            { adminUser: { name: { contains: q, mode: "insensitive" } } },
            { adminUser: { email: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
  const [sessions, total] = await Promise.all([
    prisma.adminSession.findMany({
      where,
      select: sessionSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminSession.count({ where }),
  ]);
  return {
    sessions: sessions.map((session) => ({
      ...session,
      state: sessionState(session),
      current: session.id === currentSessionId,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getSessionSummary() {
  const now = new Date();
  const [active, revoked, expired] = await Promise.all([
    prisma.adminSession.count({ where: { revokedAt: null, expiresAt: { gt: now } } }),
    prisma.adminSession.count({ where: { revokedAt: { not: null } } }),
    prisma.adminSession.count({ where: { revokedAt: null, expiresAt: { lte: now } } }),
  ]);
  return { active, revoked, expired, total: active + revoked + expired };
}

async function revokeSession(
  sessionIdValue: unknown,
  actingAdminId: string,
  currentSessionId: string,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const sessionId = requiredId(sessionIdValue, "Session ID");
  if (sessionId === currentSessionId) {
    throw new ApiError(
      409,
      "Use Sign out or Revoke my sessions for the current session",
      "CURRENT_SESSION_REVOCATION_REJECTED",
    );
  }
  const reason = boundedText(reasonValue, "Audit reason", 10, 500);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const session = await transaction.adminSession.findUnique({
      where: { id: sessionId },
      select: sessionSelect,
    });
    if (!session) {
      throw new ApiError(404, "Admin session not found", "ADMIN_SESSION_NOT_FOUND");
    }
    if (session.revokedAt) {
      throw new ApiError(409, "Admin session is already revoked", "ADMIN_SESSION_REVOKED");
    }
    if (session.expiresAt <= now) {
      throw new ApiError(409, "Expired sessions do not require revocation", "ADMIN_SESSION_EXPIRED");
    }
    const updated = await transaction.adminSession.update({
      where: { id: sessionId },
      data: {
        revokedAt: now,
        revokedByAdminId: actingAdminId,
        revocationReason: reason,
      },
      select: sessionSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "ADMIN_SESSION_REVOKED_BY_ADMIN",
        resourceType: "AdminSession",
        resourceId: sessionId,
        metadata: { reason, targetAdminUserId: session.adminUserId },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return { ...updated, state: "revoked" as const, current: false };
  });
}

async function revokeAdminSessions(
  targetAdminIdValue: unknown,
  actingAdminId: string,
  currentSessionId: string,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const targetAdminId = requiredId(targetAdminIdValue, "Administrator ID");
  const reason = boundedText(reasonValue, "Audit reason", 10, 500);
  const now = new Date();
  return prisma.$transaction(async (transaction) => {
    const target = await transaction.adminUser.findUnique({
      where: { id: targetAdminId },
      select: { id: true, name: true, email: true },
    });
    if (!target) {
      throw new ApiError(404, "Administrator not found", "ADMIN_USER_NOT_FOUND");
    }
    const revoked = await transaction.adminSession.updateMany({
      where: {
        adminUserId: targetAdminId,
        id: { not: currentSessionId },
        revokedAt: null,
        expiresAt: { gt: now },
      },
      data: {
        revokedAt: now,
        revokedByAdminId: actingAdminId,
        revocationReason: reason,
      },
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "ADMIN_SESSIONS_REVOKED_BY_ADMIN",
        resourceType: "AdminUser",
        resourceId: targetAdminId,
        metadata: { reason, revokedCount: revoked.count },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return { admin: target, revokedCount: revoked.count };
  });
}

export const adminManagementService = {
  list,
  getSummary,
  getById,
  invite,
  updateRole,
  updateStatus,
  resetCredentials,
  listSessions,
  getSessionSummary,
  revokeSession,
  revokeAdminSessions,
};
