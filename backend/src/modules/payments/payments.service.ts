import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { getPlatformSettings } from "../../config/platform-settings.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { recordCustomerActivity } from "../customer-activity/customer-activity.service.js";
import { publishPlatformChange } from "../platform-events.js";

type PaymentMethod = "UPI" | "CARD" | "NET_BANKING";

interface PaymentProviderRequest {
  userId: string;
  amount: number;
  method: PaymentMethod;
}

interface PaymentProviderResult {
  status: "completed";
  reference: string;
}

export interface PaymentProvider {
  process(request: PaymentProviderRequest): Promise<PaymentProviderResult>;
}

class DevelopmentPaymentProvider implements PaymentProvider {
  async process(_request: PaymentProviderRequest): Promise<PaymentProviderResult> {
    return {
      status: "completed",
      reference: `MOCK-${randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase()}`,
    };
  }
}

const paymentProvider: PaymentProvider = new DevelopmentPaymentProvider();

const transactionSelect = {
  id: true,
  userId: true,
  assetId: true,
  type: true,
  amount: true,
  direction: true,
  description: true,
  status: true,
  providerReference: true,
  paymentMethod: true,
  transactionDate: true,
} as const;

function validateAmount(value: unknown, maximum: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ApiError(400, "Amount must be a number", "VALIDATION_ERROR");
  }

  const amount = Math.round(value * 100) / 100;
  if (amount < 1 || amount > maximum) {
    throw new ApiError(
      400,
      `Amount must be between ₹1 and ₹${maximum.toLocaleString("en-IN")}`,
      "VALIDATION_ERROR",
    );
  }

  if (Math.abs(amount - value) > 0.000001) {
    throw new ApiError(
      400,
      "Amount cannot have more than two decimal places",
      "VALIDATION_ERROR",
    );
  }

  return amount;
}

function validateMethod(value: unknown): PaymentMethod {
  if (typeof value !== "string") {
    throw new ApiError(400, "Payment method is required", "VALIDATION_ERROR");
  }

  const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
  if (
    normalized !== "UPI" &&
    normalized !== "CARD" &&
    normalized !== "NET_BANKING"
  ) {
    throw new ApiError(
      400,
      "Payment method must be UPI, CARD, or NET_BANKING",
      "VALIDATION_ERROR",
    );
  }

  return normalized;
}

function paymentDescription(method: PaymentMethod, reference: string) {
  return `Wallet recharge via ${method} · Ref ${reference}`;
}

function toPayment(
  transaction: Prisma.TransactionGetPayload<{ select: typeof transactionSelect }>,
) {
  return {
    transactionId: transaction.id,
    amount: Number(transaction.amount),
    method: (transaction.paymentMethod ?? "UPI") as PaymentMethod,
    providerReference: transaction.providerReference,
    status: transaction.status,
    transactionDate: transaction.transactionDate,
    description: transaction.description,
  };
}

async function create(
  userId: string,
  input: { amount?: unknown; method?: unknown },
) {
  const settings = await getPlatformSettings();
  if (!settings.walletRechargeEnabled) {
    throw new ApiError(
      503,
      "Wallet recharges are temporarily disabled",
      "WALLET_RECHARGE_DISABLED",
    );
  }
  const amount = validateAmount(input.amount, settings.maxRechargeAmount);
  const method = validateMethod(input.method);
  const result = await paymentProvider.process({ userId, amount, method });

  const transaction = await prisma.transaction.create({
    data: {
      userId,
      type: "PAYMENT",
      amount,
      direction: "CREDIT",
      description: paymentDescription(method, result.reference),
      status: result.status,
      providerReference: result.reference,
      paymentMethod: method,
      source: "customer_payment",
    },
    select: transactionSelect,
  });

  await recordCustomerActivity({userId,eventType:"PAYMENT_RECORDED",metadata:{transactionId:transaction.id,amount,method}});
  publishPlatformChange({type:"payment",action:"recorded",resourceId:transaction.id});
  return toPayment(transaction);
}

async function getById(userId: string, transactionId: string) {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      userId,
      type: "PAYMENT",
    },
    select: transactionSelect,
  });

  if (!transaction) {
    throw new ApiError(404, "Payment not found", "PAYMENT_NOT_FOUND");
  }

  return toPayment(transaction);
}

export const paymentsService = {
  create,
  getById,
};
