import type { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";

const MAX_EXPORT_ROWS = 10_000;
const sensitiveAuditKey =
  /(password|secret|token|csrf|backup.?code|authorization|cookie|credential)/i;

export interface AdminAuditInput {
  adminUserId?: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Prisma.InputJsonValue;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
}

export function sanitizeAuditMetadata(
  value: unknown,
  depth = 0,
): Prisma.JsonValue {
  if (depth > 8) return "[MAX_DEPTH]";
  if (value === null) return null;
  if (typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") {
    return value.length > 2_000 ? `${value.slice(0, 2_000)}…[TRUNCATED]` : value;
  }
  if (Array.isArray(value)) {
    return value
      .slice(0, 100)
      .map((item) => sanitizeAuditMetadata(item, depth + 1));
  }
  if (typeof value === "object") {
    const result: Record<string, Prisma.JsonValue> = {};
    for (const [key, item] of Object.entries(value).slice(0, 100)) {
      result[key] = sensitiveAuditKey.test(key)
        ? "[REDACTED]"
        : sanitizeAuditMetadata(item, depth + 1);
    }
    return result;
  }
  return String(value);
}

export async function recordAdminAudit(input: AdminAuditInput) {
  return prisma.adminAuditLog.create({
    data: {
      adminUserId: input.adminUserId ?? null,
      action: input.action,
      resourceType: input.resourceType,
      resourceId: input.resourceId ?? null,
      ...(input.metadata !== undefined
        ? {
            metadata: sanitizeAuditMetadata(
              input.metadata,
            ) as Prisma.InputJsonValue,
          }
        : {}),
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent?.slice(0, 500) ?? null,
      success: input.success ?? true,
    },
  });
}

type AuditQueryInput = {
  q?: unknown;
  action?: unknown;
  resourceType?: unknown;
  adminUserId?: unknown;
  success?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

type AuditFilters = {
  q?: string;
  action?: string;
  resourceType?: string;
  adminUserId?: string;
  success?: boolean;
  dateFrom?: Date;
  dateToExclusive?: Date;
};

const auditSelect = {
  id: true,
  adminUserId: true,
  action: true,
  resourceType: true,
  resourceId: true,
  metadata: true,
  ipAddress: true,
  userAgent: true,
  success: true,
  createdAt: true,
  adminUser: {
    select: { id: true, name: true, email: true, role: true, status: true },
  },
} as const;

function queryText(value: unknown, label: string, maximum: number) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} must be a string`, "VALIDATION_ERROR");
  }
  const normalized = value.trim();
  if (normalized.length > maximum) {
    throw new ApiError(400, `${label} is too long`, "VALIDATION_ERROR");
  }
  return normalized || undefined;
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

function booleanFilter(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (value === "true" || value === true) return true;
  if (value === "false" || value === false) return false;
  throw new ApiError(400, "Success filter must be true or false", "VALIDATION_ERROR");
}

function indiaDate(value: unknown, label: string, nextDay = false) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} must use YYYY-MM-DD`, "VALIDATION_ERROR");
  }
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year!, month! - 1, day!) - 330 * 60 * 1_000;
  const date = new Date(timestamp);
  const check = new Date(date.getTime() + 330 * 60 * 1_000);
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month! - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new ApiError(400, `${label} is invalid`, "VALIDATION_ERROR");
  }
  return nextDay ? new Date(date.getTime() + 24 * 60 * 60 * 1_000) : date;
}

function parseFilters(input: AuditQueryInput): AuditFilters {
  const dateFrom = indiaDate(input.dateFrom, "Start date");
  const dateToExclusive = indiaDate(input.dateTo, "End date", true);
  if (dateFrom && dateToExclusive && dateFrom >= dateToExclusive) {
    throw new ApiError(400, "Start date must be on or before end date", "VALIDATION_ERROR");
  }
  return {
    q: queryText(input.q, "Search query", 100),
    action: queryText(input.action, "Action", 100),
    resourceType: queryText(input.resourceType, "Resource type", 100),
    adminUserId: queryText(input.adminUserId, "Administrator ID", 100),
    success: booleanFilter(input.success),
    dateFrom,
    dateToExclusive,
  };
}

function auditWhere(filters: AuditFilters): Prisma.AdminAuditLogWhereInput {
  return {
    ...(filters.action ? { action: filters.action } : {}),
    ...(filters.resourceType ? { resourceType: filters.resourceType } : {}),
    ...(filters.adminUserId ? { adminUserId: filters.adminUserId } : {}),
    ...(filters.success !== undefined ? { success: filters.success } : {}),
    ...(filters.dateFrom || filters.dateToExclusive
      ? {
          createdAt: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateToExclusive ? { lt: filters.dateToExclusive } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { id: { contains: filters.q, mode: "insensitive" } },
            { action: { contains: filters.q, mode: "insensitive" } },
            { resourceType: { contains: filters.q, mode: "insensitive" } },
            { resourceId: { contains: filters.q, mode: "insensitive" } },
            { adminUser: { name: { contains: filters.q, mode: "insensitive" } } },
            { adminUser: { email: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

function serializeAudit<T extends { metadata: Prisma.JsonValue | null }>(entry: T) {
  return {
    ...entry,
    metadata:
      entry.metadata === null ? null : sanitizeAuditMetadata(entry.metadata),
  };
}

async function list(input: AuditQueryInput) {
  const filters = parseFilters(input);
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 25, 100);
  const where = auditWhere(filters);
  const [entries, total] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where,
      select: auditSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.adminAuditLog.count({ where }),
  ]);
  return {
    entries: entries.map(serializeAudit),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getSummary() {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1_000);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1_000);
  const [total, last24Hours, rejectedLast24Hours, activeAdminGroups] =
    await Promise.all([
      prisma.adminAuditLog.count(),
      prisma.adminAuditLog.count({ where: { createdAt: { gte: dayAgo } } }),
      prisma.adminAuditLog.count({
        where: { createdAt: { gte: dayAgo }, success: false },
      }),
      prisma.adminAuditLog.groupBy({
        by: ["adminUserId"],
        where: { createdAt: { gte: monthAgo }, adminUserId: { not: null } },
      }),
    ]);
  return {
    total,
    last24Hours,
    rejectedLast24Hours,
    activeAdminsLast30Days: activeAdminGroups.length,
    generatedAt: new Date(),
  };
}

async function getFacets() {
  const [actionGroups, resourceGroups, admins] = await Promise.all([
    prisma.adminAuditLog.groupBy({
      by: ["action"],
      _count: { _all: true },
      orderBy: { action: "asc" },
    }),
    prisma.adminAuditLog.groupBy({
      by: ["resourceType"],
      _count: { _all: true },
      orderBy: { resourceType: "asc" },
    }),
    prisma.adminUser.findMany({
      select: { id: true, name: true, email: true, role: true, status: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    actions: actionGroups.map((group) => ({
      value: group.action,
      count: group._count._all,
    })),
    resourceTypes: resourceGroups.map((group) => ({
      value: group.resourceType,
      count: group._count._all,
    })),
    admins,
  };
}

function csvCell(value: unknown) {
  const raw = value === undefined || value === null ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

async function exportCsv(
  input: AuditQueryInput,
  actingAdminId: string,
  context: AdminRequestContext,
) {
  const filters = parseFilters(input);
  const where = auditWhere(filters);
  const total = await prisma.adminAuditLog.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    throw new ApiError(
      422,
      `Export exceeds ${MAX_EXPORT_ROWS.toLocaleString("en-IN")} rows. Narrow the filters.`,
      "AUDIT_EXPORT_LIMIT_EXCEEDED",
    );
  }
  const entries = await prisma.adminAuditLog.findMany({
    where,
    select: auditSelect,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  const header = [
    "Audit ID",
    "Occurred at",
    "Success",
    "Action",
    "Resource type",
    "Resource ID",
    "Admin ID",
    "Admin name",
    "Admin email",
    "Admin role",
    "IP address",
    "User agent",
    "Metadata JSON",
  ];
  const rows = entries.map((entry) =>
    [
      entry.id,
      entry.createdAt.toISOString(),
      entry.success,
      entry.action,
      entry.resourceType,
      entry.resourceId,
      entry.adminUserId,
      entry.adminUser?.name,
      entry.adminUser?.email,
      entry.adminUser?.role,
      entry.ipAddress,
      entry.userAgent,
      entry.metadata === null
        ? ""
        : JSON.stringify(sanitizeAuditMetadata(entry.metadata)),
    ]
      .map(csvCell)
      .join(","),
  );
  await recordAdminAudit({
    adminUserId: actingAdminId,
    action: "ADMIN_AUDIT_EXPORTED",
    resourceType: "AdminAuditLog",
    metadata: {
      rowCount: entries.length,
      hasSearchQuery: Boolean(filters.q),
      actionFilter: filters.action ?? null,
      resourceTypeFilter: filters.resourceType ?? null,
      adminFilterApplied: Boolean(filters.adminUserId),
      successFilter: filters.success ?? null,
      dateFrom: filters.dateFrom?.toISOString() ?? null,
      dateToExclusive: filters.dateToExclusive?.toISOString() ?? null,
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return `\uFEFF${header.map(csvCell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

export const adminAuditService = {
  record: recordAdminAudit,
  list,
  getSummary,
  getFacets,
  exportCsv,
};
