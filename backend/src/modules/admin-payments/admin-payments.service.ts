import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";

const financeTypes = ["PAYMENT", "REFUND", "ADJUSTMENT"] as const;
const paymentStatuses = ["pending", "completed", "failed"] as const;
const directions = ["CREDIT", "DEBIT"] as const;
const paymentMethods = ["UPI", "CARD", "NET_BANKING"] as const;
const MAX_EXPORT_ROWS = 10_000;

const relatedTransactionSelect = {
  id: true,
  userId: true,
  type: true,
  amount: true,
  direction: true,
  description: true,
  status: true,
  providerReference: true,
  paymentMethod: true,
  source: true,
  originalTransactionId: true,
  createdByAdminId: true,
  adminReason: true,
  transactionDate: true,
  updatedAt: true,
} satisfies Prisma.TransactionSelect;

const financeTransactionSelect = {
  ...relatedTransactionSelect,
  assetId: true,
  user: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      accountStatus: true,
    },
  },
  createdByAdmin: {
    select: { id: true, name: true, email: true, role: true },
  },
  originalTransaction: { select: relatedTransactionSelect },
  reversals: {
    where: { type: "REFUND" },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    select: {
      ...relatedTransactionSelect,
      createdByAdmin: {
        select: { id: true, name: true, email: true, role: true },
      },
    },
  },
} satisfies Prisma.TransactionSelect;

type FinanceFilters = {
  q?: string;
  status?: (typeof paymentStatuses)[number];
  type?: (typeof financeTypes)[number];
  direction?: (typeof directions)[number];
  method?: (typeof paymentMethods)[number];
  dateFrom?: Date;
  dateToExclusive?: Date;
};

type FinanceQueryInput = {
  q?: unknown;
  status?: unknown;
  type?: unknown;
  direction?: unknown;
  method?: unknown;
  dateFrom?: unknown;
  dateTo?: unknown;
  page?: unknown;
  pageSize?: unknown;
};

interface RefundProviderResult {
  status: "completed";
  reference: string;
}

interface RefundProvider {
  refund(input: {
    paymentReference: string;
    amount: number;
    method: string | null;
  }): Promise<RefundProviderResult>;
}

class DevelopmentRefundProvider implements RefundProvider {
  async refund(_input: {
    paymentReference: string;
    amount: number;
    method: string | null;
  }): Promise<RefundProviderResult> {
    return {
      status: "completed",
      reference: `MOCK-RFD-${randomUUID().replace(/-/g, "").slice(0, 20).toUpperCase()}`,
    };
  }
}

const refundProvider: RefundProvider = new DevelopmentRefundProvider();

function normalizedQuery(value: unknown) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, "Search query must be a string", "VALIDATION_ERROR");
  }
  const result = value.trim();
  if (result.length > 100) {
    throw new ApiError(400, "Search query is too long", "VALIDATION_ERROR");
  }
  return result || undefined;
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(400, `Invalid ${label}`, "VALIDATION_ERROR");
  }
  const normalized = value.trim().toUpperCase();
  const match = allowed.find((entry) => entry.toUpperCase() === normalized);
  if (!match) {
    throw new ApiError(400, `Invalid ${label}`, "VALIDATION_ERROR");
  }
  return match as T[number];
}

function requiredEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
) {
  const result = optionalEnum(value, allowed, label);
  if (!result) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return result;
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

function indiaDate(value: unknown, label: string, nextDay = false) {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new ApiError(400, `${label} must use YYYY-MM-DD`, "VALIDATION_ERROR");
  }
  const [year, month, day] = value.split("-").map(Number);
  const timestamp = Date.UTC(year!, month! - 1, day!, 0, 0, 0) - 330 * 60 * 1000;
  const date = new Date(timestamp);
  const indiaCheck = new Date(date.getTime() + 330 * 60 * 1000);
  if (
    indiaCheck.getUTCFullYear() !== year ||
    indiaCheck.getUTCMonth() !== month! - 1 ||
    indiaCheck.getUTCDate() !== day
  ) {
    throw new ApiError(400, `${label} is not a valid date`, "VALIDATION_ERROR");
  }
  return nextDay ? new Date(date.getTime() + 24 * 60 * 60 * 1000) : date;
}

function parseFilters(input: FinanceQueryInput): FinanceFilters {
  const dateFrom = indiaDate(input.dateFrom, "Start date");
  const dateToExclusive = indiaDate(input.dateTo, "End date", true);
  if (dateFrom && dateToExclusive && dateFrom >= dateToExclusive) {
    throw new ApiError(400, "Start date must be on or before end date", "VALIDATION_ERROR");
  }
  return {
    q: normalizedQuery(input.q),
    status: optionalEnum(input.status, paymentStatuses, "payment status"),
    type: optionalEnum(input.type, financeTypes, "finance entry type"),
    direction: optionalEnum(input.direction, directions, "direction"),
    method: optionalEnum(input.method, paymentMethods, "payment method"),
    dateFrom,
    dateToExclusive,
  };
}

function financeWhere(filters: FinanceFilters): Prisma.TransactionWhereInput {
  return {
    type: filters.type ? filters.type : { in: [...financeTypes] },
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.direction ? { direction: filters.direction } : {}),
    ...(filters.method ? { paymentMethod: filters.method } : {}),
    ...(filters.dateFrom || filters.dateToExclusive
      ? {
          transactionDate: {
            ...(filters.dateFrom ? { gte: filters.dateFrom } : {}),
            ...(filters.dateToExclusive ? { lt: filters.dateToExclusive } : {}),
          },
        }
      : {}),
    ...(filters.q
      ? {
          OR: [
            { id: { contains: filters.q, mode: "insensitive" } },
            {
              providerReference: {
                contains: filters.q,
                mode: "insensitive",
              },
            },
            { description: { contains: filters.q, mode: "insensitive" } },
            { user: { name: { contains: filters.q, mode: "insensitive" } } },
            { user: { phone: { contains: filters.q } } },
            { user: { email: { contains: filters.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

function money(value: Prisma.Decimal | number | null | undefined) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

function minorUnits(value: Prisma.Decimal | number) {
  return Math.round(Number(value) * 100);
}

function refundAmount(transaction: {
  reversals: Array<{
    amount: Prisma.Decimal;
    type: string;
    direction: string;
    status: string;
  }>;
}) {
  return money(
    transaction.reversals.reduce(
      (total, entry) =>
        entry.type === "REFUND" &&
        entry.direction === "DEBIT" &&
        entry.status === "completed"
          ? total + Number(entry.amount)
          : total,
      0,
    ),
  );
}

function serializeRelated<T extends { amount: Prisma.Decimal }>(transaction: T) {
  return { ...transaction, amount: money(transaction.amount) };
}

function serializeTransaction(
  transaction: Prisma.TransactionGetPayload<{
    select: typeof financeTransactionSelect;
  }>,
) {
  const refundedAmount = refundAmount(transaction);
  const amount = money(transaction.amount);
  return {
    ...transaction,
    amount,
    originalTransaction: transaction.originalTransaction
      ? serializeRelated(transaction.originalTransaction)
      : null,
    reversals: transaction.reversals.map((entry) => serializeRelated(entry)),
    refundSummary:
      transaction.type === "PAYMENT"
        ? {
            refundedAmount,
            remainingRefundable: money(Math.max(0, amount - refundedAmount)),
            state:
              refundedAmount <= 0
                ? "not_refunded"
                : refundedAmount >= amount
                  ? "fully_refunded"
                  : "partially_refunded",
          }
        : null,
  };
}

async function balanceForUser(
  transaction: Prisma.TransactionClient,
  userId: string,
) {
  const [credits, debits] = await Promise.all([
    transaction.transaction.aggregate({
      where: { userId, direction: "CREDIT", status: "completed" },
      _sum: { amount: true },
    }),
    transaction.transaction.aggregate({
      where: { userId, direction: "DEBIT", status: "completed" },
      _sum: { amount: true },
    }),
  ]);
  return money(Number(credits._sum.amount ?? 0) - Number(debits._sum.amount ?? 0));
}

function amountInput(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, "Amount must be a number", "VALIDATION_ERROR");
  }
  const amount = Math.round(value * 100) / 100;
  if (amount < 1 || amount > 100_000) {
    throw new ApiError(
      400,
      "Amount must be between ₹1 and ₹1,00,000",
      "VALIDATION_ERROR",
    );
  }
  if (Math.abs(value - amount) > 0.000001) {
    throw new ApiError(
      400,
      "Amount cannot have more than two decimal places",
      "VALIDATION_ERROR",
    );
  }
  return amount;
}

function boundedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  const result = value.trim().replace(/\s+/g, " ");
  if (result.length < minimum || result.length > maximum) {
    throw new ApiError(
      400,
      `${label} must be between ${minimum} and ${maximum} characters`,
      "VALIDATION_ERROR",
    );
  }
  return result;
}

function optionalDescription(value: unknown, fallback: string) {
  if (value === undefined || value === null || value === "") return fallback;
  return boundedText(value, "Customer ledger description", 5, 140);
}

function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0 || value.length > 100) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

function idempotencyKey(value: unknown) {
  if (
    typeof value !== "string" ||
    !/^[A-Za-z0-9._:-]{16,100}$/.test(value)
  ) {
    throw new ApiError(
      400,
      "A valid idempotency key is required",
      "VALIDATION_ERROR",
    );
  }
  return value;
}

function startOfCurrentMonthInIndia() {
  const offset = 330 * 60 * 1000;
  const indiaNow = new Date(Date.now() + offset);
  return new Date(
    Date.UTC(indiaNow.getUTCFullYear(), indiaNow.getUTCMonth(), 1) - offset,
  );
}

async function serializable<T>(
  operation: (transaction: Prisma.TransactionClient) => Promise<T>,
) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await prisma.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 3
      ) {
        continue;
      }
      throw error;
    }
  }
  throw new ApiError(409, "Concurrent finance update rejected", "FINANCE_CONFLICT");
}

async function list(input: FinanceQueryInput) {
  const filters = parseFilters(input);
  const page = positiveInteger(input.page, 1, 100_000);
  const pageSize = positiveInteger(input.pageSize, 20, 100);
  const where = financeWhere(filters);
  const [transactions, total] = await Promise.all([
    prisma.transaction.findMany({
      where,
      select: financeTransactionSelect,
      orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.transaction.count({ where }),
  ]);
  return {
    transactions: transactions.map(serializeTransaction),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getSummary() {
  const monthStart = startOfCurrentMonthInIndia();
  const [
    completedPayments,
    completedPaymentCount,
    pendingPayments,
    pendingPaymentCount,
    failedPayments,
    failedPaymentCount,
    refunds,
    refundCount,
    creditAdjustments,
    debitAdjustments,
    adjustmentCount,
  ] = await Promise.all([
    prisma.transaction.aggregate({
      where: { type: "PAYMENT", direction: "CREDIT", status: "completed" },
      _sum: { amount: true },
    }),
    prisma.transaction.count({
      where: { type: "PAYMENT", direction: "CREDIT", status: "completed" },
    }),
    prisma.transaction.aggregate({
      where: { type: "PAYMENT", status: "pending" },
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where: { type: "PAYMENT", status: "pending" } }),
    prisma.transaction.aggregate({
      where: { type: "PAYMENT", status: "failed" },
      _sum: { amount: true },
    }),
    prisma.transaction.count({ where: { type: "PAYMENT", status: "failed" } }),
    prisma.transaction.aggregate({
      where: {
        source: "admin_refund",
        status: "completed",
        transactionDate: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.count({
      where: {
        source: "admin_refund",
        status: "completed",
        transactionDate: { gte: monthStart },
      },
    }),
    prisma.transaction.aggregate({
      where: {
        source: "admin_adjustment",
        direction: "CREDIT",
        transactionDate: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        source: "admin_adjustment",
        direction: "DEBIT",
        transactionDate: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.count({
      where: {
        source: "admin_adjustment",
        transactionDate: { gte: monthStart },
      },
    }),
  ]);
  return {
    completedPayments: {
      count: completedPaymentCount,
      amount: money(completedPayments._sum.amount),
    },
    pendingPayments: {
      count: pendingPaymentCount,
      amount: money(pendingPayments._sum.amount),
    },
    failedPayments: {
      count: failedPaymentCount,
      amount: money(failedPayments._sum.amount),
    },
    refundsThisMonth: {
      count: refundCount,
      amount: money(refunds._sum.amount),
      startsAt: monthStart,
    },
    adjustmentsThisMonth: {
      count: adjustmentCount,
      credits: money(creditAdjustments._sum.amount),
      debits: money(debitAdjustments._sum.amount),
      startsAt: monthStart,
    },
  };
}

async function getById(
  idValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const id = requiredId(idValue, "Transaction ID");
  const transaction = await prisma.transaction.findFirst({
    where: { id, type: { in: [...financeTypes] } },
    select: financeTransactionSelect,
  });
  if (!transaction) {
    throw new ApiError(404, "Finance transaction not found", "FINANCE_TRANSACTION_NOT_FOUND");
  }
  const customerBalance = await prisma.$transaction((database) =>
    balanceForUser(database, transaction.userId),
  );
  await recordAdminAudit({
    adminUserId,
    action: "FINANCE_TRANSACTION_VIEWED",
    resourceType: "Transaction",
    resourceId: id,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return { ...serializeTransaction(transaction), customerBalance };
}

async function getByProviderReference(
  referenceValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const reference = boundedText(
    referenceValue,
    "Provider reference",
    3,
    100,
  ).toUpperCase();
  if (!/^[A-Z0-9-]+$/.test(reference)) {
    throw new ApiError(400, "Provider reference format is invalid", "VALIDATION_ERROR");
  }
  const transaction = await prisma.transaction.findUnique({
    where: { providerReference: reference },
    select: financeTransactionSelect,
  });
  if (!transaction || !financeTypes.includes(transaction.type as (typeof financeTypes)[number])) {
    await recordAdminAudit({
      adminUserId,
      action: "PROVIDER_REFERENCE_LOOKUP",
      resourceType: "Transaction",
      metadata: { reference, found: false },
      ipAddress: context.ipAddress,
      userAgent: context.userAgent,
      success: false,
    });
    throw new ApiError(404, "Provider reference not found", "PROVIDER_REFERENCE_NOT_FOUND");
  }
  await recordAdminAudit({
    adminUserId,
    action: "PROVIDER_REFERENCE_LOOKUP",
    resourceType: "Transaction",
    resourceId: transaction.id,
    metadata: { reference, found: true },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return serializeTransaction(transaction);
}

function safeCsvCell(value: unknown) {
  const raw = value === null || value === undefined ? "" : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${formulaSafe.replace(/"/g, '""')}"`;
}

async function exportCsv(
  input: FinanceQueryInput,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const filters = parseFilters(input);
  const where = financeWhere(filters);
  const total = await prisma.transaction.count({ where });
  if (total > MAX_EXPORT_ROWS) {
    throw new ApiError(
      422,
      `Export contains more than ${MAX_EXPORT_ROWS.toLocaleString("en-IN")} rows. Narrow the filters and try again.`,
      "FINANCE_EXPORT_LIMIT_EXCEEDED",
    );
  }
  const transactions = await prisma.transaction.findMany({
    where,
    select: financeTransactionSelect,
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
  });
  const headers = [
    "Transaction ID",
    "Transaction date",
    "Status",
    "Type",
    "Direction",
    "Amount INR",
    "Customer ID",
    "Customer name",
    "Customer phone",
    "Payment method",
    "Provider reference",
    "Source",
    "Original transaction ID",
    "Refunded amount INR",
    "Created by admin",
    "Admin email",
    "Admin reason",
    "Customer ledger description",
  ];
  const rows = transactions.map((transaction) => {
    const serialized = serializeTransaction(transaction);
    return [
      transaction.id,
      transaction.transactionDate.toISOString(),
      transaction.status,
      transaction.type,
      transaction.direction,
      serialized.amount.toFixed(2),
      transaction.user.id,
      transaction.user.name,
      transaction.user.phone,
      transaction.paymentMethod,
      transaction.providerReference,
      transaction.source,
      transaction.originalTransactionId,
      serialized.refundSummary?.refundedAmount.toFixed(2) ?? "",
      transaction.createdByAdmin?.name,
      transaction.createdByAdmin?.email,
      transaction.adminReason,
      transaction.description,
    ].map(safeCsvCell).join(",");
  });
  await recordAdminAudit({
    adminUserId,
    action: "FINANCE_TRANSACTIONS_EXPORTED",
    resourceType: "Transaction",
    metadata: {
      rowCount: transactions.length,
      hasSearchQuery: Boolean(filters.q),
      status: filters.status ?? null,
      type: filters.type ?? null,
      direction: filters.direction ?? null,
      method: filters.method ?? null,
      dateFrom: filters.dateFrom?.toISOString() ?? null,
      dateToExclusive: filters.dateToExclusive?.toISOString() ?? null,
    },
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return `\uFEFF${headers.map(safeCsvCell).join(",")}\r\n${rows.join("\r\n")}\r\n`;
}

async function createAdjustment(
  actingAdminId: string,
  input: {
    userId?: unknown;
    direction?: unknown;
    amount?: unknown;
    reason?: unknown;
    description?: unknown;
    idempotencyKey?: unknown;
  },
  context: AdminRequestContext,
) {
  const userId = requiredId(input.userId, "Customer ID");
  const direction = requiredEnum(input.direction, directions, "Direction");
  const amount = amountInput(input.amount);
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const key = idempotencyKey(input.idempotencyKey);
  const description = optionalDescription(
    input.description,
    direction === "CREDIT"
      ? "Account credit adjustment by BatFIN finance"
      : "Account debit adjustment by BatFIN finance",
  );

  return serializable(async (database) => {
    const duplicate = await database.transaction.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(
        409,
        "This finance request was already processed",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const customer = await database.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, accountStatus: true },
    });
    if (!customer) {
      throw new ApiError(404, "Customer not found", "CUSTOMER_NOT_FOUND");
    }
    const balanceBefore = await balanceForUser(database, userId);
    if (direction === "DEBIT" && minorUnits(amount) > minorUnits(balanceBefore)) {
      throw new ApiError(
        409,
        "Debit adjustment exceeds the customer’s available balance",
        "INSUFFICIENT_BALANCE_FOR_ADJUSTMENT",
      );
    }
    const transaction = await database.transaction.create({
      data: {
        userId,
        type: "ADJUSTMENT",
        amount,
        direction,
        description,
        status: "completed",
        source: "admin_adjustment",
        createdByAdminId: actingAdminId,
        adminReason: reason,
        idempotencyKey: key,
      },
      select: financeTransactionSelect,
    });
    const balanceAfter = money(
      balanceBefore + (direction === "CREDIT" ? amount : -amount),
    );
    await database.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "FINANCE_ADJUSTMENT_CREATED",
        resourceType: "Transaction",
        resourceId: transaction.id,
        metadata: {
          customerId: userId,
          direction,
          amount,
          balanceBefore,
          balanceAfter,
          reason,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return {
      transaction: serializeTransaction(transaction),
      customer: { ...customer, balanceBefore, balanceAfter },
    };
  });
}

async function createRefund(
  originalIdValue: unknown,
  actingAdminId: string,
  input: {
    amount?: unknown;
    reason?: unknown;
    idempotencyKey?: unknown;
  },
  context: AdminRequestContext,
) {
  const originalId = requiredId(originalIdValue, "Original payment ID");
  const amount = amountInput(input.amount);
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const key = idempotencyKey(input.idempotencyKey);

  const providerPayment = await prisma.transaction.findUnique({
    where: { id: originalId },
    select: {
      id: true,
      type: true,
      direction: true,
      status: true,
      providerReference: true,
      paymentMethod: true,
    },
  });
  if (
    !providerPayment ||
    providerPayment.type !== "PAYMENT" ||
    providerPayment.direction !== "CREDIT"
  ) {
    throw new ApiError(404, "Original payment not found", "ORIGINAL_PAYMENT_NOT_FOUND");
  }
  if (providerPayment.status !== "completed") {
    throw new ApiError(
      409,
      "Only completed payments can be refunded",
      "PAYMENT_NOT_REFUNDABLE",
    );
  }
  if (!providerPayment.providerReference) {
    throw new ApiError(
      409,
      "Payment has no provider reference and cannot be refunded automatically",
      "PAYMENT_PROVIDER_REFERENCE_MISSING",
    );
  }
  const providerResult = await refundProvider.refund({
    paymentReference: providerPayment.providerReference,
    amount,
    method: providerPayment.paymentMethod,
  });

  return serializable(async (database) => {
    const duplicate = await database.transaction.findUnique({
      where: { idempotencyKey: key },
      select: { id: true },
    });
    if (duplicate) {
      throw new ApiError(
        409,
        "This refund request was already processed",
        "IDEMPOTENCY_KEY_REUSED",
      );
    }
    const original = await database.transaction.findUnique({
      where: { id: originalId },
      select: {
        id: true,
        userId: true,
        type: true,
        amount: true,
        direction: true,
        status: true,
        providerReference: true,
        paymentMethod: true,
      },
    });
    if (
      !original ||
      original.type !== "PAYMENT" ||
      original.direction !== "CREDIT" ||
      original.status !== "completed"
    ) {
      throw new ApiError(409, "Payment is no longer refundable", "PAYMENT_NOT_REFUNDABLE");
    }
    const refunded = await database.transaction.aggregate({
      where: {
        originalTransactionId: originalId,
        type: "REFUND",
        direction: "DEBIT",
        status: "completed",
      },
      _sum: { amount: true },
    });
    const alreadyRefunded = money(refunded._sum.amount);
    const remaining = money(Number(original.amount) - alreadyRefunded);
    if (minorUnits(amount) > minorUnits(remaining)) {
      throw new ApiError(
        409,
        `Refund exceeds the remaining refundable amount of ₹${remaining.toFixed(2)}`,
        "REFUND_AMOUNT_EXCEEDED",
      );
    }
    const balanceBefore = await balanceForUser(database, original.userId);
    if (minorUnits(amount) > minorUnits(balanceBefore)) {
      throw new ApiError(
        409,
        "Customer wallet balance is insufficient for this payment reversal",
        "INSUFFICIENT_BALANCE_FOR_REFUND",
      );
    }
    const refund = await database.transaction.create({
      data: {
        userId: original.userId,
        type: "REFUND",
        amount,
        direction: "DEBIT",
        description: `Payment returned to ${original.paymentMethod ?? "original source"} · Ref ${providerResult.reference}`,
        status: providerResult.status,
        providerReference: providerResult.reference,
        paymentMethod: original.paymentMethod,
        source: "admin_refund",
        originalTransactionId: original.id,
        createdByAdminId: actingAdminId,
        adminReason: reason,
        idempotencyKey: key,
      },
      select: financeTransactionSelect,
    });
    const balanceAfter = money(balanceBefore - amount);
    await database.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "PAYMENT_REFUND_CREATED",
        resourceType: "Transaction",
        resourceId: refund.id,
        metadata: {
          originalTransactionId: original.id,
          customerId: original.userId,
          amount,
          alreadyRefunded,
          remainingAfter: money(remaining - amount),
          balanceBefore,
          balanceAfter,
          providerReference: providerResult.reference,
          reason,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return {
      refund: serializeTransaction(refund),
      originalPaymentId: original.id,
      refundedAmount: amount,
      remainingRefundable: money(remaining - amount),
      customerBalance: balanceAfter,
    };
  });
}

export const adminPaymentsService = {
  list,
  getSummary,
  getById,
  getByProviderReference,
  exportCsv,
  createAdjustment,
  createRefund,
};
