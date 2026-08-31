import type { User } from "@prisma/client";
import jwt from "jsonwebtoken";

import { env } from "../../config/env.js";
import { getPlatformSettings } from "../../config/platform-settings.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { findClaimablePortfolioAccount, linkClaimedPortfolioAccount } from "../portfolio/portfolio.service.js";
import { publishPlatformChange } from "../platform-events.js";

const publicUserSelect = {
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
} as const;

export type PublicUser = Pick<
  User,
  | "id"
  | "name"
  | "phone"
  | "email"
  | "address"
  | "accountStatus"
  | "lastLoginAt"
  | "lastActivityAt"
  | "createdAt"
  | "updatedAt"
>;

interface OtpProvider {
  send(phone: string): Promise<void>;
  verify(phone: string, otp: string): Promise<boolean>;
}

class StaticOtpProvider implements OtpProvider {
  private readonly challenges = new Map<string, number>();

  async send(phone: string): Promise<void> {
    // A real SMS provider can replace this class without changing the API layer.
    this.challenges.set(phone, Date.now() + 5 * 60 * 1000);
  }

  async verify(phone: string, otp: string): Promise<boolean> {
    const expiresAt = this.challenges.get(phone);

    if (!expiresAt || expiresAt < Date.now()) {
      this.challenges.delete(phone);
      return false;
    }

    if (otp !== env.mockOtp) {
      return false;
    }

    this.challenges.delete(phone);
    return true;
  }
}

const otpProvider: OtpProvider = new StaticOtpProvider();

export function normalizeIndianPhone(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Phone number is required", "VALIDATION_ERROR");
  }

  const digits = value.replace(/\D/g, "");

  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `+91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91") && /^[6-9]/.test(digits[2] ?? "")) {
    return `+${digits}`;
  }

  throw new ApiError(
    400,
    "Enter a valid 10-digit Indian mobile number",
    "VALIDATION_ERROR",
  );
}

function validateName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Name is required", "VALIDATION_ERROR");
  }

  const name = value.trim().replace(/\s+/g, " ");

  if (name.length < 2 || name.length > 80) {
    throw new ApiError(
      400,
      "Name must be between 2 and 80 characters",
      "VALIDATION_ERROR",
    );
  }

  return name;
}

async function register(input: { name?: unknown; phone?: unknown; customerLoanId?: unknown; batteryNo?: unknown }) {
  const settings = await getPlatformSettings();
  if (!settings.customerRegistrationEnabled) throw new ApiError(503,"New customer registration is temporarily disabled","CUSTOMER_REGISTRATION_DISABLED");
  const name=validateName(input.name);const phone=normalizeIndianPhone(input.phone);
  const existingUser=await prisma.user.findUnique({where:{phone}});if(existingUser)throw new ApiError(409,"An account already exists for this mobile number","PHONE_ALREADY_REGISTERED");
  const wantsPortfolio=Boolean(input.customerLoanId)||Boolean(input.batteryNo);if(wantsPortfolio&&(!input.customerLoanId||!input.batteryNo))throw new ApiError(400,"Provide both Customer Loan ID and battery number to link an existing agreement","PORTFOLIO_CLAIM_INCOMPLETE");
  const portfolio=wantsPortfolio?await findClaimablePortfolioAccount({customerLoanId:input.customerLoanId,batteryNo:input.batteryNo,customerName:name}):null;
  const user=await prisma.$transaction(async transaction=>{const created=await transaction.user.create({data:{name,phone,lastActivityAt:new Date()},select:publicUserSelect});if(portfolio)await linkClaimedPortfolioAccount(portfolio.id,created.id,transaction);await transaction.customerActivity.create({data:{userId:created.id,eventType:portfolio?"CUSTOMER_REGISTERED_AND_PORTFOLIO_LINKED":"CUSTOMER_REGISTERED",metadata:portfolio?{portfolioAccountId:portfolio.id,customerLoanId:portfolio.customerLoanId}:undefined}});return created});
  publishPlatformChange({type:"customer",action:portfolio?"registered_and_linked":"registered",resourceId:user.id});return user;
}

function ensureCustomerActive(accountStatus: string) {
  if (accountStatus !== "active") {
    throw new ApiError(
      403,
      "This customer account is not active",
      "ACCOUNT_NOT_ACTIVE",
    );
  }
}

async function sendOtp(input: { phone?: unknown }) {
  const settings = await getPlatformSettings();
  if (!settings.customerOtpLoginEnabled) {
    throw new ApiError(
      503,
      "Customer OTP login is temporarily disabled",
      "CUSTOMER_OTP_LOGIN_DISABLED",
    );
  }
  const phone = normalizeIndianPhone(input.phone);
  const user = await prisma.user.findUnique({
    where: { phone },
    select: { id: true, accountStatus: true },
  });

  if (!user) {
    throw new ApiError(
      404,
      "No account was found for this mobile number",
      "USER_NOT_FOUND",
    );
  }
  ensureCustomerActive(user.accountStatus);

  await otpProvider.send(phone);

  return {
    phone,
    expiresInSeconds: 300,
    message: "OTP sent successfully",
  };
}

async function verifyOtp(input: { phone?: unknown; otp?: unknown }) {
  const settings = await getPlatformSettings();
  if (!settings.customerOtpLoginEnabled) {
    throw new ApiError(
      503,
      "Customer OTP login is temporarily disabled",
      "CUSTOMER_OTP_LOGIN_DISABLED",
    );
  }
  const phone = normalizeIndianPhone(input.phone);

  if (typeof input.otp !== "string" || !/^\d{6}$/.test(input.otp)) {
    throw new ApiError(400, "Enter a valid 6-digit OTP", "VALIDATION_ERROR");
  }

  const isValid = await otpProvider.verify(phone, input.otp);
  if (!isValid) {
    throw new ApiError(401, "The OTP is incorrect", "INVALID_OTP");
  }

  const existing=await prisma.user.findUnique({where:{phone},select:{id:true,accountStatus:true}});if(!existing)throw new ApiError(404,"User account not found","USER_NOT_FOUND");ensureCustomerActive(existing.accountStatus);const now=new Date();
  const user=await prisma.$transaction(async transaction=>{const updated=await transaction.user.update({where:{id:existing.id},data:{lastLoginAt:now,lastActivityAt:now},select:publicUserSelect});await transaction.customerActivity.create({data:{userId:existing.id,eventType:"CUSTOMER_LOGIN",metadata:{method:"OTP"}}});return updated});
  const token=jwt.sign({phone:user.phone},env.jwtSecret,{subject:user.id,expiresIn:env.jwtExpiresInSeconds});publishPlatformChange({type:"customer",action:"login",resourceId:user.id});return{token,user};
}

export const authService = {
  register,
  sendOtp,
  verifyOtp,
};
