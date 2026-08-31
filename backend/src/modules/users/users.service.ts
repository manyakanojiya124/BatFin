import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
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

function validateName(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Name must be a string", "VALIDATION_ERROR");
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

function validateEmail(value: unknown): string | null {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "Email must be a string", "VALIDATION_ERROR");
  }

  const email = value.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ApiError(400, "Enter a valid email address", "VALIDATION_ERROR");
  }

  return email;
}

function validateAddress(value: unknown): string | null {
  if (value === null || value === "") {
    return null;
  }

  if (typeof value !== "string") {
    throw new ApiError(400, "Address must be a string", "VALIDATION_ERROR");
  }

  const address = value.trim().replace(/\s+/g, " ");
  if (address.length < 3 || address.length > 250) {
    throw new ApiError(
      400,
      "Address must be between 3 and 250 characters",
      "VALIDATION_ERROR",
    );
  }

  return address;
}

async function getMe(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: publicUserSelect,
  });

  if (!user) {
    throw new ApiError(404, "User account not found", "USER_NOT_FOUND");
  }

  return user;
}

async function updateMe(
  userId: string,
  input: { name?: unknown; email?: unknown; address?: unknown },
) {
  const data: {
    name?: string;
    email?: string | null;
    address?: string | null;
  } = {};

  if (Object.prototype.hasOwnProperty.call(input, "name")) {
    data.name = validateName(input.name);
  }
  if (Object.prototype.hasOwnProperty.call(input, "email")) {
    data.email = validateEmail(input.email);
  }
  if (Object.prototype.hasOwnProperty.call(input, "address")) {
    data.address = validateAddress(input.address);
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(
      400,
      "Provide at least one of name, email, or address",
      "VALIDATION_ERROR",
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true },
  });
  if (!existingUser) {
    throw new ApiError(404, "User account not found", "USER_NOT_FOUND");
  }

  const user=await prisma.$transaction(async transaction=>{const updated=await transaction.user.update({where:{id:userId},data:{...data,lastActivityAt:new Date()},select:publicUserSelect});await transaction.customerActivity.create({data:{userId,eventType:"CUSTOMER_PROFILE_UPDATED",metadata:{changedFields:Object.keys(data)}}});return updated});publishPlatformChange({type:"customer",action:"profile_updated",resourceId:userId});return user;
}

export const usersService = {
  getMe,
  updateMe,
};
