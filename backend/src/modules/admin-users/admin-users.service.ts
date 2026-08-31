import type { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";
import { publishPlatformChange } from "../platform-events.js";

const customerStatuses = ["active", "suspended", "closed"] as const;
type CustomerStatus = (typeof customerStatuses)[number];

const customerListSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  address: true,
  accountStatus: true,
  lastLoginAt: true,
  lastActivityAt: true,
  createdAt: true,
  updatedAt: true,
  _count: {
    select: {
      assets: true,
      subscriptions: true,
      transactions: true,
      tickets: true,
      portfolioAccounts: true,
    },
  },
} as const;

function stringQuery(value: unknown, maxLength: number) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "Search query must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ApiError(400, "Search query is too long", "VALIDATION_ERROR");
  }
  return normalized || undefined;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  maximum: number,
  field: string,
) {
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
      `${field} must be an integer from 1 to ${maximum}`,
      "VALIDATION_ERROR",
    );
  }
  return parsed;
}

function customerStatus(value: unknown, optional = false): CustomerStatus | undefined {
  if ((value === undefined || value === "") && optional) return undefined;
  if (
    typeof value !== "string" ||
    !(customerStatuses as readonly string[]).includes(value.toLowerCase())
  ) {
    throw new ApiError(
      400,
      "Customer status must be active, suspended, or closed",
      "VALIDATION_ERROR",
    );
  }
  return value.toLowerCase() as CustomerStatus;
}

function reason(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "An audit reason is required", "VALIDATION_ERROR");
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

function customerId(value: unknown) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, "A valid customer ID is required", "VALIDATION_ERROR");
  }
  return value;
}

function name(value: unknown) {
  if (typeof value !== "string") {
    throw new ApiError(400, "Name must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 2 || normalized.length > 80) {
    throw new ApiError(
      400,
      "Name must be between 2 and 80 characters",
      "VALIDATION_ERROR",
    );
  }
  return normalized;
}

function email(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "Email must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)
  ) {
    throw new ApiError(400, "Enter a valid email address", "VALIDATION_ERROR");
  }
  return normalized;
}

function address(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (typeof value !== "string") {
    throw new ApiError(400, "Address must be a string", "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < 3 || normalized.length > 250) {
    throw new ApiError(
      400,
      "Address must be between 3 and 250 characters",
      "VALIDATION_ERROR",
    );
  }
  return normalized;
}

async function list(input: {
  q?: unknown;
  status?: unknown;
  page?: unknown;
  pageSize?: unknown;
}) {
  const q = stringQuery(input.q, 100);
  const status = customerStatus(input.status, true);
  const page = positiveInteger(input.page, 1, 100000, "Page");
  const pageSize = positiveInteger(input.pageSize, 20, 100, "Page size");

  const where: Prisma.UserWhereInput = {
    ...(status ? { accountStatus: status } : {}),
    ...(q
      ? {
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { phone: { contains: q } },
            { email: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [customers, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: customerListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.user.count({ where }),
  ]);

  return {
    customers,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getById(
  idValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const id = customerId(idValue);
  const customer = await prisma.user.findUnique({
    where: { id },
    select: {
      ...customerListSelect,
      assets: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
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
          createdAt: true,
        },
      },
      portfolioAccounts: {
        orderBy: { updatedAt: "desc" },
        include: { cases: { where: { isCurrent: true }, orderBy: { disburseDate: "desc" }, include: { dealer: true } } },
      },
      subscriptions: {
        orderBy: { startDate: "desc" },
        select: {
          id: true,
          status: true,
          startDate: true,
          asset: {
            select: {
              id: true,
              productType: true,
              serialNumber: true,
            },
          },
          plan: {
            select: {
              id: true,
              name: true,
              type: true,
              billingCycle: true,
            },
          },
        },
      },
      tickets: {
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
          id: true,
          assetId: true,
          type: true,
          description: true,
          status: true,
          createdAt: true,
        },
      },
      transactions: {
        orderBy: { transactionDate: "desc" },
        take: 20,
        select: {
          id: true,
          assetId: true,
          type: true,
          amount: true,
          direction: true,
          description: true,
          status: true,
          transactionDate: true,
        },
      },
    },
  });

  if (!customer) {
    throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }

  const [credits, debits] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId: id, direction: "CREDIT", status: "completed" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId: id, direction: "DEBIT", status: "completed" },
      _sum: { amount: true },
    }),
  ]);
  const totalCredits = Math.round(Number(credits._sum.amount ?? 0) * 100) / 100;
  const totalDebits = Math.round(Number(debits._sum.amount ?? 0) * 100) / 100;

  await recordAdminAudit({
    adminUserId,
    action: "CUSTOMER_VIEWED",
    resourceType: "User",
    resourceId: id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });

  return {
    ...customer,
    portfolioAccounts: customer.portfolioAccounts.map(account=>{const cases=account.cases.map(item=>({...item,emi:Number(item.emi),dpAmount:Number(item.dpAmount),contractedDemand:Number(item.contractedDemand),billedToDate:Number(item.billedToDate),futureDemand:Number(item.futureDemand)}));return{...account,cases,caseCount:cases.length,financial:{emi:cases.reduce((sum,item)=>sum+item.emi,0),dpAmount:cases.reduce((sum,item)=>sum+item.dpAmount,0),contractedDemand:cases.reduce((sum,item)=>sum+item.contractedDemand,0),billedToDate:cases.reduce((sum,item)=>sum+item.billedToDate,0),futureDemand:cases.reduce((sum,item)=>sum+item.futureDemand,0)}}}),
    transactions: customer.transactions.map((transaction) => ({
      ...transaction,
      amount: Number(transaction.amount),
    })),
    financialSummary: {
      totalCredits,
      totalDebits,
      currentBalance: Math.round((totalCredits - totalDebits) * 100) / 100,
    },
  };
}

async function updateProfile(
  idValue: unknown,
  adminUserId: string,
  input: {
    name?: unknown;
    email?: unknown;
    address?: unknown;
    reason?: unknown;
  },
  context: AdminRequestContext,
) {
  const id = customerId(idValue);
  const auditReason = reason(input.reason);
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }

  const data: Prisma.UserUpdateInput = {};
  if (Object.prototype.hasOwnProperty.call(input, "name")) data.name = name(input.name);
  if (Object.prototype.hasOwnProperty.call(input, "email")) data.email = email(input.email);
  if (Object.prototype.hasOwnProperty.call(input, "address")) {
    data.address = address(input.address);
  }
  if (Object.keys(data).length === 0) {
    throw new ApiError(
      400,
      "Provide at least one profile field to update",
      "VALIDATION_ERROR",
    );
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id },
      data,
      select: customerListSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "CUSTOMER_PROFILE_UPDATED",
        resourceType: "User",
        resourceId: id,
        metadata: {
          reason: auditReason,
          changedFields: Object.keys(data),
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
  adminUserId: string,
  input: { status?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const id = customerId(idValue);
  const status = customerStatus(input.status);
  if (!status) {
    throw new ApiError(400, "Customer status is required", "VALIDATION_ERROR");
  }
  const auditReason = reason(input.reason);
  const current = await prisma.user.findUnique({ where: { id } });
  if (!current) {
    throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
  }
  if (current.accountStatus === status) {
    throw new ApiError(
      409,
      `Customer account is already ${status}`,
      "CUSTOMER_STATUS_UNCHANGED",
    );
  }

  const updated=await prisma.$transaction(async (transaction) => {
    const updated = await transaction.user.update({
      where: { id },
      data: { accountStatus: status },
      select: customerListSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "CUSTOMER_STATUS_CHANGED",
        resourceType: "User",
        resourceId: id,
        metadata: {
          reason: auditReason,
          previousStatus: current.accountStatus,
          newStatus: status,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
  await prisma.customerActivity.create({data:{userId:id,eventType:"CUSTOMER_STATUS_CHANGED_BY_ADMIN",metadata:{previousStatus:current.accountStatus,newStatus:status}}});publishPlatformChange({type:"customer",action:"status_changed",resourceId:id});return updated;
}

export const adminUsersService = {
  list,
  getById,
  updateProfile,
  updateStatus,
};
