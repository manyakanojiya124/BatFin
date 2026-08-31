import type { Asset } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";

export interface DeviceHealthSnapshot {
  batteryLevel: number;
  temperature: number;
  status: "healthy" | "attention" | "service_required";
  serviceRequired: boolean;
}

export interface DeviceProvider {
  getHealth(asset: Asset): Promise<DeviceHealthSnapshot>;
}

function deterministicSeed(value: string) {
  let hash = 0;
  for (const character of value) {
    hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function healthStatus(
  assetStatus: string,
  batteryLevel: number,
  temperature: number,
): Pick<DeviceHealthSnapshot, "status" | "serviceRequired"> {
  if (assetStatus === "inactive" || temperature >= 45) {
    return { status: "service_required", serviceRequired: true };
  }

  if (temperature >= 40 || batteryLevel <= 20) {
    return { status: "attention", serviceRequired: false };
  }

  return { status: "healthy", serviceRequired: false };
}

class DatabaseSeededDeviceProvider implements DeviceProvider {
  async getHealth(asset: Asset): Promise<DeviceHealthSnapshot> {
    const seed = deterministicSeed(asset.serialNumber);
    const batteryLevel = asset.batteryLevel ?? 55 + (seed % 41);
    const temperature =
      asset.temperature ?? Math.round((25 + (seed % 131) / 10) * 10) / 10;

    if (asset.batteryLevel === null || asset.temperature === null) {
      await prisma.asset.update({
        where: { id: asset.id },
        data: {
          ...(asset.batteryLevel === null ? { batteryLevel } : {}),
          ...(asset.temperature === null ? { temperature } : {}),
        },
      });
    }

    return {
      batteryLevel,
      temperature,
      ...healthStatus(asset.status, batteryLevel, temperature),
    };
  }
}

const deviceProvider: DeviceProvider = new DatabaseSeededDeviceProvider();

async function getAssetHealth(userId: string, assetId: string) {
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, userId },
  });

  if (!asset) {
    throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
  }

  return deviceProvider.getHealth(asset);
}

export const healthService = {
  getAssetHealth,
};
