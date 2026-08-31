import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { recordCustomerActivity } from "../customer-activity/customer-activity.service.js";
import { publishPlatformChange } from "../platform-events.js";

const assetSelect = {
  id: true,
  userId: true,
  assetType: true,
  productType: true,
  serialNumber: true,
  vehicleNumber: true,
  status: true,
  latitude: true,
  longitude: true,
  batteryLevel: true,
  temperature: true,
  createdAt: true,
} as const;

function validateSerialNumber(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Serial number is required", "VALIDATION_ERROR");
  }

  const serialNumber = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{3,63}$/.test(serialNumber)) {
    throw new ApiError(
      400,
      "Serial number must be 4 to 64 letters, numbers, dots, slashes, underscores, or hyphens",
      "VALIDATION_ERROR",
    );
  }

  return serialNumber;
}

function validateAssetType(value: unknown): "battery" | "vehicle" {
  if (typeof value !== "string") {
    throw new ApiError(400, "Asset type is required", "VALIDATION_ERROR");
  }

  const assetType = value.trim().toLowerCase();
  if (assetType !== "battery" && assetType !== "vehicle") {
    throw new ApiError(
      400,
      "Asset type must be battery or vehicle",
      "VALIDATION_ERROR",
    );
  }

  return assetType;
}

function validateProductType(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Product type is required", "VALIDATION_ERROR");
  }

  const productType = value.trim().replace(/\s+/g, " ");
  if (productType.length < 2 || productType.length > 80) {
    throw new ApiError(
      400,
      "Product type must be between 2 and 80 characters",
      "VALIDATION_ERROR",
    );
  }

  return productType;
}

async function requireOwnedAsset(userId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId },
    select: assetSelect,
  });

  if (!asset) {
    throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  }

  return asset;
}

async function list(userId: string) {
  return prisma.asset.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: assetSelect,
  });
}

async function create(
  userId: string,
  input: {
    serialNumber?: unknown;
    assetType?: unknown;
    productType?: unknown;
  },
) {
  const serialNumber = validateSerialNumber(input.serialNumber);
  const assetType = validateAssetType(input.assetType);
  const productType = validateProductType(input.productType);

  const existingAsset = await prisma.asset.findUnique({
    where: { serialNumber },
    select: { id: true },
  });
  if (existingAsset) {
    throw new ApiError(
      409,
      "This serial number is already registered",
      "SERIAL_ALREADY_REGISTERED",
    );
  }

  const asset=await prisma.asset.create({data:{userId,serialNumber,assetType,productType},select:assetSelect});await recordCustomerActivity({userId,eventType:"ASSET_ADDED",metadata:{assetId:asset.id,serialNumber,assetType}});publishPlatformChange({type:"asset",action:"added",resourceId:asset.id});return asset;
}

async function getById(userId: string, assetId: string) {
  return requireOwnedAsset(userId, assetId);
}

async function setLockState(
  userId: string,
  assetId: string,
  targetStatus: "active" | "locked",
) {
  const asset = await requireOwnedAsset(userId, assetId);

  if (asset.status === "inactive") {
    throw new ApiError(
      409,
      "Inactive assets cannot be locked or unlocked",
      "ASSET_INACTIVE",
    );
  }

  if (asset.status === targetStatus) {
    return asset;
  }

  const updated=await prisma.asset.update({where:{id:asset.id},data:{status:targetStatus},select:assetSelect});await recordCustomerActivity({userId,eventType:targetStatus==="locked"?"ASSET_LOCKED":"ASSET_UNLOCKED",metadata:{assetId:asset.id}});publishPlatformChange({type:"asset",action:targetStatus,resourceId:asset.id});return updated;
}

async function lock(userId: string, assetId: string) {
  return setLockState(userId, assetId, "locked");
}

async function unlock(userId: string, assetId: string) {
  return setLockState(userId, assetId, "active");
}

async function getLocation(userId: string, assetId: string) {
  const asset = await requireOwnedAsset(userId, assetId);
  const available = asset.latitude !== null && asset.longitude !== null;

  return {
    assetId: asset.id,
    latitude: asset.latitude,
    longitude: asset.longitude,
    available,
  };
}

export const assetsService = {
  list,
  create,
  getById,
  lock,
  unlock,
  getLocation,
};
