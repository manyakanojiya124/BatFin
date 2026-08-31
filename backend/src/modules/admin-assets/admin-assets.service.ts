import { randomBytes, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import {
  hashAssetQrToken,
  issueAssetQr,
  verifyAssetQrSignature,
} from "../../config/admin-qr.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";

const inventoryStatuses = [
  "available",
  "assigned",
  "maintenance",
  "retired",
] as const;
const assetTypes = ["battery", "vehicle"] as const;

const inventorySelect = {
  id: true,
  userId: true,
  assetType: true,
  productType: true,
  serialNumber: true,
  vehicleNumber: true,
  status: true,
  inventoryStatus: true,
  batteryLevel: true,
  temperature: true,
  latitude: true,
  longitude: true,
  qrIssuedAt: true,
  verifiedAt: true,
  batchId: true,
  createdByAdminId: true,
  createdAt: true,
  user: {
    select: {
      id: true,
      name: true,
      phone: true,
      accountStatus: true,
    },
  },
  batch: {
    select: { id: true, name: true, status: true, createdAt: true },
  },
  createdByAdmin: {
    select: { id: true, name: true, email: true },
  },
  _count: { select: { subscriptions: true } },
} as const;

function id(value: unknown, label = "Asset ID") {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

function requiredString(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
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

function auditReason(value: unknown) {
  return requiredString(value, "Audit reason", 10, 500);
}

function assetType(value: unknown) {
  if (
    typeof value !== "string" ||
    !(assetTypes as readonly string[]).includes(value.toLowerCase())
  ) {
    throw new ApiError(
      400,
      "Asset type must be battery or vehicle",
      "VALIDATION_ERROR",
    );
  }
  return value.toLowerCase() as (typeof assetTypes)[number];
}

function serialNumber(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Serial number must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{3,63}$/.test(normalized)) {
    throw new ApiError(
      400,
      "Serial number must be 4–64 letters, numbers, dots, slashes, underscores, or hyphens",
      "VALIDATION_ERROR",
    );
  }
  return normalized;
}

function optionalVehicleNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return null;
  return requiredString(value, "Vehicle number", 4, 24).toUpperCase();
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
    throw new ApiError(
      400,
      `Value must be an integer from 1 to ${maximum}`,
      "VALIDATION_ERROR",
    );
  }
  return parsed;
}

function optionalInventoryStatus(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !(inventoryStatuses as readonly string[]).includes(value.toLowerCase())
  ) {
    throw new ApiError(400, "Invalid inventory status", "VALIDATION_ERROR");
  }
  return value.toLowerCase() as (typeof inventoryStatuses)[number];
}

function optionalAssignment(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (value !== "assigned" && value !== "unassigned") {
    throw new ApiError(
      400,
      "Assignment filter must be assigned or unassigned",
      "VALIDATION_ERROR",
    );
  }
  return value;
}

function optionalSearch(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || value.length > 100) {
    throw new ApiError(400, "Search query is invalid", "VALIDATION_ERROR");
  }
  return value.trim() || undefined;
}

function randomSegment(length = 6) {
  return randomBytes(length)
    .toString("base64url")
    .replace(/[^A-Z0-9]/gi, "")
    .toUpperCase()
    .padEnd(length, "X")
    .slice(0, length);
}

async function generateSingleSerial(type: "battery" | "vehicle") {
  const prefix = type === "battery" ? "BAT" : "VEH";
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const serial = `${prefix}-${date}-${randomSegment(8)}`;
    const existing = await prisma.asset.findUnique({
      where: { serialNumber: serial },
      select: { id: true },
    });
    if (!existing) return serial;
  }
  throw new ApiError(
    503,
    "Unable to allocate a unique serial number",
    "SERIAL_GENERATION_FAILED",
  );
}

async function generateBatchSerials(
  type: "battery" | "vehicle",
  quantity: number,
) {
  const prefix = type === "battery" ? "BAT" : "VEH";
  const date = new Date().toISOString().slice(2, 10).replace(/-/g, "");
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const batchCode = randomSegment(5);
    const serials = Array.from(
      { length: quantity },
      (_, index) =>
        `${prefix}-${date}-${batchCode}-${String(index + 1).padStart(4, "0")}`,
    );
    const collisions = await prisma.asset.count({
      where: { serialNumber: { in: serials } },
    });
    if (collisions === 0) return serials;
  }
  throw new ApiError(
    503,
    "Unable to allocate collision-free batch serials",
    "SERIAL_GENERATION_FAILED",
  );
}

async function list(input: {
  q?: unknown;
  assetType?: unknown;
  inventoryStatus?: unknown;
  assignment?: unknown;
  page?: unknown;
  pageSize?: unknown;
}) {
  const q = optionalSearch(input.q);
  const type = input.assetType ? assetType(input.assetType) : undefined;
  const status = optionalInventoryStatus(input.inventoryStatus);
  const assignment = optionalAssignment(input.assignment);
  const page = positiveInteger(input.page, 1, 100000);
  const pageSize = positiveInteger(input.pageSize, 20, 100);

  const where: Prisma.AssetWhereInput = {
    ...(type ? { assetType: type } : {}),
    ...(status ? { inventoryStatus: status } : {}),
    ...(assignment === "assigned"
      ? { userId: { not: null } }
      : assignment === "unassigned"
        ? { userId: null }
        : {}),
    ...(q
      ? {
          OR: [
            { serialNumber: { contains: q, mode: "insensitive" } },
            { productType: { contains: q, mode: "insensitive" } },
            { vehicleNumber: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { phone: { contains: q } } },
          ],
        }
      : {}),
  };

  const [assets, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      select: inventorySelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.asset.count({ where }),
  ]);
  return {
    assets,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getSummary() {
  const [total, assigned, available, maintenance, retired, verified] =
    await Promise.all([
      prisma.asset.count(),
      prisma.asset.count({ where: { userId: { not: null } } }),
      prisma.asset.count({ where: { inventoryStatus: "available" } }),
      prisma.asset.count({ where: { inventoryStatus: "maintenance" } }),
      prisma.asset.count({ where: { inventoryStatus: "retired" } }),
      prisma.asset.count({ where: { verifiedAt: { not: null } } }),
    ]);
  return {
    total,
    assigned,
    unassigned: total - assigned,
    available,
    maintenance,
    retired,
    qrVerified: verified,
  };
}

async function getById(
  assetIdValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const assetId = id(assetIdValue);
  const asset = await prisma.asset.findUnique({
    where: { id: assetId },
    select: inventorySelect,
  });
  if (!asset) throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  await recordAdminAudit({
    adminUserId,
    action: "INVENTORY_ASSET_VIEWED",
    resourceType: "Asset",
    resourceId: assetId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return asset;
}

async function create(
  adminUserId: string,
  input: {
    assetType?: unknown;
    productType?: unknown;
    serialNumber?: unknown;
    vehicleNumber?: unknown;
    reason?: unknown;
  },
  context: AdminRequestContext,
) {
  const type = assetType(input.assetType);
  const productType = requiredString(input.productType, "Product type", 2, 80);
  const serial = input.serialNumber
    ? serialNumber(input.serialNumber)
    : await generateSingleSerial(type);
  const vehicleNumber = optionalVehicleNumber(input.vehicleNumber);
  const reason = auditReason(input.reason);
  const existing = await prisma.asset.findUnique({
    where: { serialNumber: serial },
    select: { id: true },
  });
  if (existing) {
    throw new ApiError(
      409,
      "This serial number already exists",
      "SERIAL_ALREADY_REGISTERED",
    );
  }

  const assetId = randomUUID();
  const qr = issueAssetQr(assetId, serial);
  const asset = await prisma.$transaction(async (transaction) => {
    const created = await transaction.asset.create({
      data: {
        id: assetId,
        userId: null,
        assetType: type,
        productType,
        serialNumber: serial,
        vehicleNumber,
        status: "inactive",
        inventoryStatus: "available",
        qrTokenHash: qr.tokenHash,
        qrIssuedAt: qr.issuedAt,
        createdByAdminId: adminUserId,
      },
      select: inventorySelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "INVENTORY_ASSET_CREATED",
        resourceType: "Asset",
        resourceId: created.id,
        metadata: { reason, serialNumber: serial, assetType: type },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return created;
  });
  return { asset, qrData: qr.qrData };
}

async function createBatch(
  adminUserId: string,
  input: {
    name?: unknown;
    assetType?: unknown;
    productType?: unknown;
    quantity?: unknown;
    serialNumbers?: unknown;
    reason?: unknown;
  },
  context: AdminRequestContext,
) {
  const batchName = requiredString(input.name, "Batch name", 3, 100);
  const type = assetType(input.assetType);
  const productType = requiredString(input.productType, "Product type", 2, 80);
  const reason = auditReason(input.reason);

  let serials: string[];
  if (Array.isArray(input.serialNumbers) && input.serialNumbers.length > 0) {
    if (input.serialNumbers.length > 500) {
      throw new ApiError(400, "A batch cannot exceed 500 assets", "BATCH_TOO_LARGE");
    }
    serials = input.serialNumbers.map(serialNumber);
    if (new Set(serials).size !== serials.length) {
      throw new ApiError(
        400,
        "The uploaded batch contains duplicate serial numbers",
        "DUPLICATE_BATCH_SERIALS",
      );
    }
  } else {
    const quantity = positiveInteger(input.quantity, 1, 500);
    serials = await generateBatchSerials(type, quantity);
  }

  const existing = await prisma.asset.findMany({
    where: { serialNumber: { in: serials } },
    select: { serialNumber: true },
  });
  if (existing.length > 0) {
    throw new ApiError(
      409,
      `Existing serial numbers: ${existing
        .slice(0, 10)
        .map((item) => item.serialNumber)
        .join(", ")}`,
      "BATCH_SERIAL_COLLISION",
    );
  }

  const batchId = randomUUID();
  const issuedAssets = serials.map((serial) => {
    const assetId = randomUUID();
    const qr = issueAssetQr(assetId, serial);
    return { assetId, serial, qr };
  });

  const result = await prisma.$transaction(
    async (transaction) => {
      const batch = await transaction.assetBatch.create({
        data: {
          id: batchId,
          name: batchName,
          assetType: type,
          productType,
          quantity: issuedAssets.length,
          status: "processing",
          createdByAdminId: adminUserId,
        },
      });
      const items = [];
      for (const item of issuedAssets) {
        const asset = await transaction.asset.create({
          data: {
            id: item.assetId,
            userId: null,
            assetType: type,
            productType,
            serialNumber: item.serial,
            status: "inactive",
            inventoryStatus: "available",
            batchId,
            createdByAdminId: adminUserId,
            qrTokenHash: item.qr.tokenHash,
            qrIssuedAt: item.qr.issuedAt,
          },
          select: inventorySelect,
        });
        items.push({ asset, qrData: item.qr.qrData });
      }
      const completedBatch = await transaction.assetBatch.update({
        where: { id: batch.id },
        data: { status: "completed", completedAt: new Date() },
      });
      await transaction.adminAuditLog.create({
        data: {
          adminUserId,
          action: "INVENTORY_BATCH_CREATED",
          resourceType: "AssetBatch",
          resourceId: batch.id,
          metadata: {
            reason,
            name: batchName,
            quantity: items.length,
            assetType: type,
          },
          ipAddress: context.ipAddress ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
      return { batch: completedBatch, items };
    },
    { timeout: 60_000 },
  );
  return result;
}

async function listBatches(input: { page?: unknown; pageSize?: unknown }) {
  const page = positiveInteger(input.page, 1, 100000);
  const pageSize = positiveInteger(input.pageSize, 20, 100);
  const [batches, total] = await Promise.all([
    prisma.assetBatch.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdByAdmin: { select: { id: true, name: true, email: true } },
        _count: { select: { assets: true } },
      },
    }),
    prisma.assetBatch.count(),
  ]);
  return {
    batches,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getBatch(batchIdValue: unknown) {
  const batchId = id(batchIdValue, "Batch ID");
  const batch = await prisma.assetBatch.findUnique({
    where: { id: batchId },
    include: {
      createdByAdmin: { select: { id: true, name: true, email: true } },
      assets: {
        orderBy: { serialNumber: "asc" },
        select: inventorySelect,
      },
    },
  });
  if (!batch) {
    throw new ApiError(404, "Asset batch not found", "ASSET_BATCH_NOT_FOUND");
  }
  return batch;
}

async function rotateQr(
  assetIdValue: unknown,
  adminUserId: string,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const assetId = id(assetIdValue);
  const reason = auditReason(reasonValue);
  const current = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!current) throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  if (current.inventoryStatus === "retired") {
    throw new ApiError(409, "Retired assets cannot issue QRs", "ASSET_RETIRED");
  }
  const qr = issueAssetQr(current.id, current.serialNumber);
  const asset = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.asset.update({
      where: { id: assetId },
      data: {
        qrTokenHash: qr.tokenHash,
        qrIssuedAt: qr.issuedAt,
        verifiedAt: null,
      },
      select: inventorySelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "INVENTORY_QR_ROTATED",
        resourceType: "Asset",
        resourceId: assetId,
        metadata: { reason, serialNumber: current.serialNumber },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
  return { asset, qrData: qr.qrData };
}

async function verifyQr(
  qrDataValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  if (typeof qrDataValue !== "string" || qrDataValue.length < 20) {
    throw new ApiError(400, "A signed QR payload is required", "VALIDATION_ERROR");
  }
  let payload;
  try {
    payload = verifyAssetQrSignature(qrDataValue);
  } catch (error) {
    await recordAdminAudit({
      adminUserId,
      action: "INVENTORY_QR_REJECTED",
      resourceType: "Asset",
      metadata: {
        reason: error instanceof Error ? error.message : "invalid_qr",
      },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(400, "QR verification failed", "INVALID_ASSET_QR");
  }

  const asset = await prisma.asset.findUnique({ where: { id: payload.assetId } });
  const valid =
    asset &&
    asset.serialNumber === payload.serialNumber &&
    asset.qrTokenHash === hashAssetQrToken(payload.token) &&
    asset.inventoryStatus !== "retired";
  if (!valid || !asset) {
    await recordAdminAudit({
      adminUserId,
      action: "INVENTORY_QR_REJECTED",
      resourceType: "Asset",
      resourceId: payload.assetId,
      metadata: { reason: "token_or_asset_mismatch" },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(400, "QR verification failed", "INVALID_ASSET_QR");
  }

  const verifiedAt = new Date();
  const verifiedAsset = await prisma.$transaction(async (transaction) => {
    const updated = await transaction.asset.update({
      where: { id: asset.id },
      data: { verifiedAt },
      select: inventorySelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "INVENTORY_QR_VERIFIED",
        resourceType: "Asset",
        resourceId: asset.id,
        metadata: { serialNumber: asset.serialNumber },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
  return { verified: true, asset: verifiedAsset, verifiedAt };
}

async function assign(
  assetIdValue: unknown,
  adminUserId: string,
  input: { userId?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const assetId = id(assetIdValue);
  const userId = id(input.userId, "Customer ID");
  const reason = auditReason(input.reason);
  const [asset, user] = await Promise.all([
    prisma.asset.findUnique({ where: { id: assetId } }),
    prisma.user.findUnique({ where: { id: userId } }),
  ]);
  if (!asset) throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  if (!user) throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  if (user.accountStatus !== "active") {
    throw new ApiError(409, "Customer account is not active", "CUSTOMER_NOT_ACTIVE");
  }
  if (asset.userId) {
    throw new ApiError(409, "Asset is already assigned", "ASSET_ALREADY_ASSIGNED");
  }
  if (asset.inventoryStatus !== "available") {
    throw new ApiError(
      409,
      "Only available assets can be assigned",
      "ASSET_NOT_AVAILABLE",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.asset.update({
      where: { id: assetId },
      data: {
        userId,
        inventoryStatus: "assigned",
        status: "active",
      },
      select: inventorySelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "INVENTORY_ASSET_ASSIGNED",
        resourceType: "Asset",
        resourceId: assetId,
        metadata: { reason, customerId: userId },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

async function unassign(
  assetIdValue: unknown,
  adminUserId: string,
  reasonValue: unknown,
  context: AdminRequestContext,
) {
  const assetId = id(assetIdValue);
  const reason = auditReason(reasonValue);
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  if (!asset.userId) {
    throw new ApiError(409, "Asset is not assigned", "ASSET_NOT_ASSIGNED");
  }
  const activeSubscriptions = await prisma.subscription.count({
    where: { assetId, status: "active" },
  });
  if (activeSubscriptions > 0) {
    throw new ApiError(
      409,
      "End the active subscription before unassigning this asset",
      "ACTIVE_SUBSCRIPTION_EXISTS",
    );
  }
  const previousCustomerId = asset.userId;

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.asset.update({
      where: { id: assetId },
      data: {
        userId: null,
        inventoryStatus: "available",
        status: "inactive",
      },
      select: inventorySelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "INVENTORY_ASSET_UNASSIGNED",
        resourceType: "Asset",
        resourceId: assetId,
        metadata: { reason, previousCustomerId },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

async function updateLifecycle(
  assetIdValue: unknown,
  adminUserId: string,
  input: { inventoryStatus?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const assetId = id(assetIdValue);
  const target = optionalInventoryStatus(input.inventoryStatus);
  if (!target || target === "assigned") {
    throw new ApiError(
      400,
      "Lifecycle status must be available, maintenance, or retired",
      "VALIDATION_ERROR",
    );
  }
  const reason = auditReason(input.reason);
  const asset = await prisma.asset.findUnique({ where: { id: assetId } });
  if (!asset) throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  if (asset.inventoryStatus === "retired") {
    throw new ApiError(409, "Retired assets cannot change lifecycle", "ASSET_RETIRED");
  }
  if ((target === "available" || target === "retired") && asset.userId) {
    throw new ApiError(
      409,
      "Unassign the customer before this lifecycle change",
      "ASSET_STILL_ASSIGNED",
    );
  }
  if (target === "retired") {
    const activeSubscriptions = await prisma.subscription.count({
      where: { assetId, status: "active" },
    });
    if (activeSubscriptions > 0) {
      throw new ApiError(
        409,
        "End active subscriptions before retiring this asset",
        "ACTIVE_SUBSCRIPTION_EXISTS",
      );
    }
  }

  const operationalStatus =
    target === "maintenance" ? "locked" : "inactive";
  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.asset.update({
      where: { id: assetId },
      data: { inventoryStatus: target, status: operationalStatus },
      select: inventorySelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "INVENTORY_LIFECYCLE_CHANGED",
        resourceType: "Asset",
        resourceId: assetId,
        metadata: {
          reason,
          previousStatus: asset.inventoryStatus,
          newStatus: target,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

export const adminAssetsService = {
  list,
  getSummary,
  getById,
  create,
  createBatch,
  listBatches,
  getBatch,
  rotateQr,
  verifyQr,
  assign,
  unassign,
  updateLifecycle,
};
