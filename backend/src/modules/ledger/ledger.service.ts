import type { Prisma } from "@prisma/client";

import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";

const transactionTypes = [
  "RENTAL",
  "PAYMENT",
  "PENALTY",
  "INSURANCE",
  "REFUND",
  "ADJUSTMENT",
  "DEPOSIT",
  "SECURITY",
  "PROCESSING_FEE",
  "CHALLAN",
  "AMC",
  "PARKING",
  "CHARGING",
] as const;

const transactionSelect = {
  id: true,
  userId: true,
  assetId: true,
  type: true,
  amount: true,
  direction: true,
  description: true,
  status: true,
  transactionDate: true,
} as const;

function normalizeTransactionType(value: unknown): string | undefined {
  if (value === undefined || value === "") return undefined;
  if (typeof value !== "string") {
    throw new ApiError(
      400,
      "Transaction type filter must be a string",
      "VALIDATION_ERROR",
    );
  }

  const normalized = value.trim().toUpperCase();
  if (!(transactionTypes as readonly string[]).includes(normalized)) {
    throw new ApiError(
      400,
      `Transaction type must be one of: ${transactionTypes.join(", ")}`,
      "VALIDATION_ERROR",
    );
  }

  return normalized;
}

function startOfCurrentMonthInIndia(now = new Date()) {
  const indiaOffsetMilliseconds = 330 * 60 * 1000;
  const indiaTime = new Date(now.getTime() + indiaOffsetMilliseconds);

  return new Date(
    Date.UTC(indiaTime.getUTCFullYear(), indiaTime.getUTCMonth(), 1) -
      indiaOffsetMilliseconds,
  );
}

function amount(value: number | Prisma.Decimal | null | undefined) {
  return Math.round(Number(value ?? 0) * 100) / 100;
}

async function list(userId: string, typeFilter: unknown) {
  const type = normalizeTransactionType(typeFilter);

  const transactions = await prisma.transaction.findMany({
    where: {
      userId,
      ...(type ? { type } : {}),
    },
    orderBy: [{ transactionDate: "desc" }, { id: "desc" }],
    select: transactionSelect,
  });
  return transactions.map((transaction) => ({
    ...transaction,
    amount: Number(transaction.amount),
  }));
}

async function getSummary(userId: string) {
  const monthStart = startOfCurrentMonthInIndia();
  const [allCredits, allDebits, monthCredits, monthDebits] = await Promise.all([
    prisma.transaction.aggregate({
      where: { userId, direction: "CREDIT", status: "completed" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: { userId, direction: "DEBIT", status: "completed" },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        direction: "CREDIT",
        status: "completed",
        transactionDate: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
    prisma.transaction.aggregate({
      where: {
        userId,
        direction: "DEBIT",
        status: "completed",
        transactionDate: { gte: monthStart },
      },
      _sum: { amount: true },
    }),
  ]);

  const totalCredits = amount(allCredits._sum.amount);
  const totalDebits = amount(allDebits._sum.amount);
  const thisMonthCredits = amount(monthCredits._sum.amount);
  const thisMonthDebits = amount(monthDebits._sum.amount);

  return {
    currentBalance: amount(totalCredits - totalDebits),
    totalCredits,
    totalDebits,
    thisMonth: {
      credits: thisMonthCredits,
      debits: thisMonthDebits,
      net: amount(thisMonthCredits - thisMonthDebits),
      startsAt: monthStart,
    },
  };
}

export const ledgerService = {
  list,
  getSummary,
};
