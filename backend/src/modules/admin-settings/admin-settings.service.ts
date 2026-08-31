import type { Prisma } from "@prisma/client";

import { env } from "../../config/env.js";
import {
  DEFAULT_PLATFORM_SETTINGS,
  PLATFORM_SETTING_ID,
  getPlatformSettings,
} from "../../config/platform-settings.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { sanitizeAuditMetadata } from "../admin-audit/admin-audit.service.js";

function reason(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Audit reason is required", "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 10 || normalized.length > 500) {
    throw new ApiError(
      400,
      "Audit reason must be between 10 and 500 characters",
      "VALIDATION_ERROR",
    );
  }
  return normalized;
}

function optionalBoolean(value: unknown, label: string) {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean") {
    throw new ApiError(400, `${label} must be a boolean`, "VALIDATION_ERROR");
  }
  return value;
}

function supportEmail(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "Support email must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new ApiError(400, "Enter a valid support email", "VALIDATION_ERROR");
  }
  return normalized;
}

function maxRechargeAmount(value: unknown) {
  if (value === undefined) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, "Maximum recharge amount must be a number", "VALIDATION_ERROR");
  }
  const amount = Math.round(value * 100) / 100;
  if (amount < 1 || amount > 500_000 || Math.abs(amount - value) > 0.000001) {
    throw new ApiError(
      400,
      "Maximum recharge amount must be ₹1–₹5,00,000 with up to two decimals",
      "VALIDATION_ERROR",
    );
  }
  return amount;
}

function serializeSetting(setting: {
  id: string;
  supportEmail: string | null;
  maintenanceMode: boolean;
  customerRegistrationEnabled: boolean;
  customerOtpLoginEnabled: boolean;
  walletRechargeEnabled: boolean;
  maxRechargeAmount: Prisma.Decimal | number;
  updatedByAdminId?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}) {
  return { ...setting, maxRechargeAmount: Number(setting.maxRechargeAmount) };
}

async function get() {
  const setting = await getPlatformSettings();
  return {
    setting,
    securityBaseline: {
      adminSessionHours: env.adminSessionHours,
      stepUpWindowMinutes: 5,
      loginChallengeMinutes: 5,
      maximumLoginFailures: 5,
      accountLockMinutes: 15,
      passwordMinimumCharacters: 14,
      passwordMaximumCharacters: 128,
      totpDigits: 6,
      totpPeriodSeconds: 30,
      totpAllowedClockWindows: 1,
      backupCodeCount: 10,
      adminCookieHttpOnly: true,
      adminCookieSameSite: "strict",
      adminCookieSecureInProduction: true,
      auditDatabaseAppendOnly: true,
      securityHeadersEnabled: true,
      rateLimitingEnabled: true,
    },
  };
}

async function update(
  actingAdminId: string,
  input: {
    supportEmail?: unknown;
    maintenanceMode?: unknown;
    customerRegistrationEnabled?: unknown;
    customerOtpLoginEnabled?: unknown;
    walletRechargeEnabled?: unknown;
    maxRechargeAmount?: unknown;
    reason?: unknown;
  },
  context: AdminRequestContext,
) {
  const auditReason = reason(input.reason);
  const data = {
    supportEmail: supportEmail(input.supportEmail),
    maintenanceMode: optionalBoolean(input.maintenanceMode, "Maintenance mode"),
    customerRegistrationEnabled: optionalBoolean(
      input.customerRegistrationEnabled,
      "Customer registration setting",
    ),
    customerOtpLoginEnabled: optionalBoolean(
      input.customerOtpLoginEnabled,
      "Customer OTP login setting",
    ),
    walletRechargeEnabled: optionalBoolean(
      input.walletRechargeEnabled,
      "Wallet recharge setting",
    ),
    maxRechargeAmount: maxRechargeAmount(input.maxRechargeAmount),
  };
  const defined = Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  ) as Prisma.SystemSettingUncheckedUpdateInput;
  if (Object.keys(defined).length === 0) {
    throw new ApiError(400, "At least one setting is required", "VALIDATION_ERROR");
  }

  return prisma.$transaction(async (transaction) => {
    const current = await getPlatformSettings(transaction);
    const updated = await transaction.systemSetting.upsert({
      where: { id: PLATFORM_SETTING_ID },
      create: {
        id: PLATFORM_SETTING_ID,
        supportEmail:
          data.supportEmail === undefined
            ? DEFAULT_PLATFORM_SETTINGS.supportEmail
            : data.supportEmail,
        maintenanceMode:
          data.maintenanceMode ?? DEFAULT_PLATFORM_SETTINGS.maintenanceMode,
        customerRegistrationEnabled:
          data.customerRegistrationEnabled ??
          DEFAULT_PLATFORM_SETTINGS.customerRegistrationEnabled,
        customerOtpLoginEnabled:
          data.customerOtpLoginEnabled ??
          DEFAULT_PLATFORM_SETTINGS.customerOtpLoginEnabled,
        walletRechargeEnabled:
          data.walletRechargeEnabled ??
          DEFAULT_PLATFORM_SETTINGS.walletRechargeEnabled,
        maxRechargeAmount:
          data.maxRechargeAmount ?? DEFAULT_PLATFORM_SETTINGS.maxRechargeAmount,
        updatedByAdminId: actingAdminId,
      },
      update: { ...defined, updatedByAdminId: actingAdminId },
    });
    const serialized = serializeSetting(updated);
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "SYSTEM_SETTINGS_UPDATED",
        resourceType: "SystemSetting",
        resourceId: PLATFORM_SETTING_ID,
        metadata: sanitizeAuditMetadata({
          reason: auditReason,
          previous: {
            supportEmail: current.supportEmail,
            maintenanceMode: current.maintenanceMode,
            customerRegistrationEnabled: current.customerRegistrationEnabled,
            customerOtpLoginEnabled: current.customerOtpLoginEnabled,
            walletRechargeEnabled: current.walletRechargeEnabled,
            maxRechargeAmount: current.maxRechargeAmount,
          },
          next: {
            supportEmail: serialized.supportEmail,
            maintenanceMode: serialized.maintenanceMode,
            customerRegistrationEnabled: serialized.customerRegistrationEnabled,
            customerOtpLoginEnabled: serialized.customerOtpLoginEnabled,
            walletRechargeEnabled: serialized.walletRechargeEnabled,
            maxRechargeAmount: serialized.maxRechargeAmount,
          },
        }) as Prisma.InputJsonValue,
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return serialized;
  });
}

export const adminSettingsService = { get, update };
