import type { Prisma } from "@prisma/client";

import { prisma } from "../database/prisma.js";

export const PLATFORM_SETTING_ID = "platform";

export const DEFAULT_PLATFORM_SETTINGS = {
  id: PLATFORM_SETTING_ID,
  supportEmail: "support@batfin.local" as string | null,
  maintenanceMode: false,
  customerRegistrationEnabled: true,
  customerOtpLoginEnabled: true,
  walletRechargeEnabled: true,
  maxRechargeAmount: 100_000,
} as const;

export async function getPlatformSettings(
  database: Prisma.TransactionClient | typeof prisma = prisma,
) {
  const setting = await database.systemSetting.findUnique({
    where: { id: PLATFORM_SETTING_ID },
  });
  return setting
    ? {
        ...setting,
        maxRechargeAmount: Number(setting.maxRechargeAmount),
      }
    : DEFAULT_PLATFORM_SETTINGS;
}
