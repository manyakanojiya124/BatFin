import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { recordCustomerActivity } from "../customer-activity/customer-activity.service.js";
import { publishPlatformChange } from "../platform-events.js";

const planSelect = {
  id: true,
  name: true,
  type: true,
  billingCycle: true,
  minimumBalance: true,
  creditLimit: true,
  pricePerKm: true,
  pricePerKwh: true,
  status: true,
} as const;

const subscriptionSelect = {
  id: true,
  userId: true,
  assetId: true,
  planId: true,
  startDate: true,
  status: true,
  asset: {
    select: {
      id: true,
      assetType: true,
      productType: true,
      serialNumber: true,
      status: true,
    },
  },
  plan: { select: planSelect },
} as const;

function validateId(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, `${field} is required`, "VALIDATION_ERROR");
  }

  return value.trim();
}

async function listPlans() {
  return prisma.plan.findMany({
    where: { status: "active" },
    orderBy: [{ type: "asc" }, { name: "asc" }],
    select: planSelect,
  });
}

async function createSubscription(
  userId: string,
  input: { assetId?: unknown; planId?: unknown },
) {
  const assetId = validateId(input.assetId, "Asset ID");
  const planId = validateId(input.planId, "Plan ID");

  const subscription=await prisma.$transaction(async (transaction) => {
    const asset = await transaction.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true, status: true },
    });
    if (!asset) {
      throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
    }
    if (asset.status === "inactive") {
      throw new ApiError(
        409,
        "An inactive asset cannot start a subscription",
        "ASSET_INACTIVE",
      );
    }

    const plan = await transaction.plan.findFirst({
      where: { id: planId, status: "active" },
      select: { id: true },
    });
    if (!plan) {
      throw new ApiError(404, "Plan not found", "PLAN_NOT_FOUND");
    }

    const activeSubscription = await transaction.subscription.findFirst({
      where: { userId, assetId, status: "active" },
      select: { id: true },
    });
    if (activeSubscription) {
      throw new ApiError(
        409,
        "This asset already has an active subscription",
        "ACTIVE_SUBSCRIPTION_EXISTS",
      );
    }

    return transaction.subscription.create({
      data: { userId, assetId, planId },
      select: subscriptionSelect,
    });
  });
  await recordCustomerActivity({userId,eventType:"SUBSCRIPTION_CREATED",metadata:{subscriptionId:subscription.id,assetId,planId}});publishPlatformChange({type:"subscription",action:"created",resourceId:subscription.id});return subscription;
}

async function getActiveSubscription(userId: string) {
  return prisma.subscription.findFirst({
    where: { userId, status: "active" },
    orderBy: { startDate: "desc" },
    select: subscriptionSelect,
  });
}

export const plansService = {
  listPlans,
  createSubscription,
  getActiveSubscription,
};
