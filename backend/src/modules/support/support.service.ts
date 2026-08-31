import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { recordCustomerActivity } from "../customer-activity/customer-activity.service.js";
import { publishPlatformChange } from "../platform-events.js";

const ticketTypes = [
  "ACCIDENT",
  "HEALTH_ISSUE",
  "LEASE_PAUSE",
  "NOC_TRANSFER",
  "COMPLAINT",
  "FORECLOSURE",
  "REPORT_ISSUE",
  "OTHER",
] as const;

const ticketSelect = {
  id: true,
  userId: true,
  assetId: true,
  type: true,
  description: true,
  priority: true,
  status: true,
  resolutionMessage: true,
  slaDueAt: true,
  firstResponseAt: true,
  resolvedAt: true,
  closedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

function validateTicketType(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Ticket type is required", "VALIDATION_ERROR");
  }

  const normalized = value.trim().toUpperCase().replace(/[ -]+/g, "_");
  if (!(ticketTypes as readonly string[]).includes(normalized)) {
    throw new ApiError(
      400,
      `Ticket type must be one of: ${ticketTypes.join(", ")}`,
      "VALIDATION_ERROR",
    );
  }

  return normalized;
}

function validateDescription(value: unknown): string {
  if (typeof value !== "string") {
    throw new ApiError(400, "Description is required", "VALIDATION_ERROR");
  }

  const description = value.trim().replace(/\s+/g, " ");
  if (description.length < 10 || description.length > 1000) {
    throw new ApiError(
      400,
      "Description must be between 10 and 1000 characters",
      "VALIDATION_ERROR",
    );
  }

  return description;
}

function normalizeAssetId(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ApiError(400, "Asset ID must be a string", "VALIDATION_ERROR");
  }

  return value.trim();
}

function ticketServicePolicy(type: string) {
  const policy: Record<string, { priority: string; hours: number }> = {
    ACCIDENT: { priority: "critical", hours: 4 },
    HEALTH_ISSUE: { priority: "high", hours: 8 },
    FORECLOSURE: { priority: "high", hours: 24 },
    COMPLAINT: { priority: "normal", hours: 24 },
    REPORT_ISSUE: { priority: "normal", hours: 24 },
    LEASE_PAUSE: { priority: "normal", hours: 48 },
    OTHER: { priority: "normal", hours: 48 },
    NOC_TRANSFER: { priority: "normal", hours: 72 },
  };
  return policy[type] ?? { priority: "normal", hours: 48 };
}

async function create(
  userId: string,
  input: { type?: unknown; assetId?: unknown; description?: unknown },
) {
  const type = validateTicketType(input.type);
  const description = validateDescription(input.description);
  const assetId = normalizeAssetId(input.assetId);

  if (assetId) {
    const asset = await prisma.asset.findFirst({
      where: { id: assetId, userId },
      select: { id: true },
    });
    if (!asset) {
      throw new ApiError(404, "Asset not found", "ASSET_NOT_FOUND");
    }
  }

  const policy=ticketServicePolicy(type);const ticket=await prisma.supportTicket.create({data:{userId,assetId,type,description,priority:policy.priority,slaDueAt:new Date(Date.now()+policy.hours*60*60*1000)},select:ticketSelect});await recordCustomerActivity({userId,eventType:"SUPPORT_TICKET_CREATED",metadata:{ticketId:ticket.id,type,priority:policy.priority}});publishPlatformChange({type:"ticket",action:"created",resourceId:ticket.id});return ticket;
}

async function list(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: ticketSelect,
  });
}

export const supportService = {
  create,
  list,
};
