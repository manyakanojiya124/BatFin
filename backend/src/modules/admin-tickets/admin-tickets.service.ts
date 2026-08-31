import type { Prisma } from "@prisma/client";

import {
  ROLE_PERMISSIONS,
  type AdminRole,
} from "../../config/admin-permissions.js";
import { prisma } from "../../database/prisma.js";
import { ApiError } from "../../middleware/error.middleware.js";
import { recordCustomerActivity } from "../customer-activity/customer-activity.service.js";
import { publishPlatformChange } from "../platform-events.js";
import type { AdminRequestContext } from "../admin-auth/admin-auth.service.js";
import { recordAdminAudit } from "../admin-audit/admin-audit.service.js";

const statuses = ["open", "in_progress", "resolved", "closed"] as const;
const priorities = ["low", "normal", "high", "critical"] as const;
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

const ticketListSelect = {
  id: true,
  userId: true,
  assetId: true,
  assignedAdminId: true,
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
  user: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true,
      accountStatus: true,
    },
  },
  asset: {
    select: {
      id: true,
      productType: true,
      serialNumber: true,
      status: true,
      inventoryStatus: true,
    },
  },
  assignedAdmin: {
    select: { id: true, name: true, email: true, role: true, status: true },
  },
  _count: { select: { notes: true } },
} as const;

function requiredId(value: unknown, label: string) {
  if (typeof value !== "string" || value.length === 0) {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  return value;
}

function optionalEnum<T extends readonly string[]>(
  value: unknown,
  allowed: T,
  label: string,
) {
  if (value === undefined || value === "") return undefined;
  if (
    typeof value !== "string" ||
    !allowed.includes(value as T[number])
  ) {
    throw new ApiError(400, `Invalid ${label}`, "VALIDATION_ERROR");
  }
  return value as T[number];
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

function boundedText(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  if (typeof value !== "string") {
    throw new ApiError(400, `${label} is required`, "VALIDATION_ERROR");
  }
  const normalized = value.trim().replace(/\s+/g, " ");
  if (normalized.length < minimum || normalized.length > maximum) {
    throw new ApiError(
      400,
      `${label} must be between ${minimum} and ${maximum} characters`,
      "VALIDATION_ERROR",
    );
  }
  return normalized;
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

function slaHours(priority: string) {
  return priority === "critical"
    ? 4
    : priority === "high"
      ? 8
      : priority === "low"
        ? 72
        : 24;
}

function allowedTransition(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    open: ["in_progress"],
    in_progress: ["resolved"],
    resolved: ["in_progress", "closed"],
    closed: ["in_progress"],
  };
  return transitions[from]?.includes(to) ?? false;
}

async function list(
  adminUserId: string,
  input: {
    q?: unknown;
    status?: unknown;
    priority?: unknown;
    type?: unknown;
    assignment?: unknown;
    page?: unknown;
    pageSize?: unknown;
  },
) {
  const q =
    typeof input.q === "string" && input.q.trim()
      ? input.q.trim().slice(0, 100)
      : undefined;
  const status = optionalEnum(input.status, statuses, "ticket status");
  const priority = optionalEnum(input.priority, priorities, "ticket priority");
  const type = optionalEnum(input.type, ticketTypes, "ticket type");
  const assignment = optionalEnum(
    input.assignment,
    ["mine", "unassigned", "all"] as const,
    "assignment filter",
  );
  const page = positiveInteger(input.page, 1, 100000);
  const pageSize = positiveInteger(input.pageSize, 20, 100);

  const where: Prisma.SupportTicketWhereInput = {
    ...(status ? { status } : {}),
    ...(priority ? { priority } : {}),
    ...(type ? { type } : {}),
    ...(assignment === "mine"
      ? { assignedAdminId: adminUserId }
      : assignment === "unassigned"
        ? { assignedAdminId: null }
        : {}),
    ...(q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { description: { contains: q, mode: "insensitive" } },
            { user: { name: { contains: q, mode: "insensitive" } } },
            { user: { phone: { contains: q } } },
            { asset: { serialNumber: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [tickets, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where,
      select: ticketListSelect,
      orderBy: [{ slaDueAt: "asc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.supportTicket.count({ where }),
  ]);
  return {
    tickets,
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    },
  };
}

async function getSummary() {
  const now = new Date();
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const [open, inProgress, overdue, critical, unassigned, resolvedToday] =
    await Promise.all([
      prisma.supportTicket.count({ where: { status: "open" } }),
      prisma.supportTicket.count({ where: { status: "in_progress" } }),
      prisma.supportTicket.count({
        where: {
          status: { in: ["open", "in_progress"] },
          slaDueAt: { lt: now },
        },
      }),
      prisma.supportTicket.count({
        where: {
          priority: "critical",
          status: { in: ["open", "in_progress"] },
        },
      }),
      prisma.supportTicket.count({
        where: {
          assignedAdminId: null,
          status: { in: ["open", "in_progress"] },
        },
      }),
      prisma.supportTicket.count({
        where: { resolvedAt: { gte: todayStart } },
      }),
    ]);
  return { open, inProgress, overdue, critical, unassigned, resolvedToday };
}

async function getById(
  ticketIdValue: unknown,
  adminUserId: string,
  context: AdminRequestContext,
) {
  const ticketId = requiredId(ticketIdValue, "Ticket ID");
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: {
      ...ticketListSelect,
      notes: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          adminUser: {
            select: { id: true, name: true, email: true, role: true },
          },
        },
      },
    },
  });
  if (!ticket) {
    throw new ApiError(404, "Support ticket not found", "TICKET_NOT_FOUND");
  }
  await recordAdminAudit({
    adminUserId,
    action: "SUPPORT_TICKET_VIEWED",
    resourceType: "SupportTicket",
    resourceId: ticketId,
    ipAddress: context.ipAddress,
    userAgent: context.userAgent,
  });
  return ticket;
}

async function listAssignees() {
  const admins = await prisma.adminUser.findMany({
    where: { status: "active" },
    select: { id: true, name: true, email: true, role: true },
    orderBy: { name: "asc" },
  });
  return admins.filter((admin) =>
    ROLE_PERMISSIONS[admin.role as AdminRole]?.includes("tickets.update"),
  );
}

async function assign(
  ticketIdValue: unknown,
  actingAdminId: string,
  input: { adminUserId?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const ticketId = requiredId(ticketIdValue, "Ticket ID");
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const assigneeId =
    input.adminUserId === null || input.adminUserId === ""
      ? null
      : requiredId(input.adminUserId, "Assignee ID");
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Support ticket not found", "TICKET_NOT_FOUND");

  if (assigneeId) {
    const assignee = await prisma.adminUser.findUnique({ where: { id: assigneeId } });
    if (
      !assignee ||
      assignee.status !== "active" ||
      !ROLE_PERMISSIONS[assignee.role as AdminRole]?.includes("tickets.update")
    ) {
      throw new ApiError(400, "Assignee cannot process tickets", "INVALID_TICKET_ASSIGNEE");
    }
  }

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.supportTicket.update({
      where: { id: ticketId },
      data: {
        assignedAdminId: assigneeId,
        ...(assigneeId && ticket.status === "open" ? { status: "in_progress" } : {}),
        ...(assigneeId && !ticket.firstResponseAt
          ? { firstResponseAt: new Date() }
          : {}),
      },
      select: ticketListSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId: actingAdminId,
        action: "SUPPORT_TICKET_ASSIGNED",
        resourceType: "SupportTicket",
        resourceId: ticketId,
        metadata: {
          reason,
          previousAssigneeId: ticket.assignedAdminId,
          newAssigneeId: assigneeId,
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

async function updatePriority(
  ticketIdValue: unknown,
  adminUserId: string,
  input: { priority?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const ticketId = requiredId(ticketIdValue, "Ticket ID");
  const priority = requiredEnum(input.priority, priorities, "priority");
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Support ticket not found", "TICKET_NOT_FOUND");
  if (ticket.priority === priority) {
    throw new ApiError(409, "Ticket priority is unchanged", "TICKET_PRIORITY_UNCHANGED");
  }
  const slaDueAt = new Date(
    ticket.createdAt.getTime() + slaHours(priority) * 60 * 60 * 1000,
  );

  return prisma.$transaction(async (transaction) => {
    const updated = await transaction.supportTicket.update({
      where: { id: ticketId },
      data: { priority, slaDueAt },
      select: ticketListSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "SUPPORT_TICKET_PRIORITY_CHANGED",
        resourceType: "SupportTicket",
        resourceId: ticketId,
        metadata: {
          reason,
          previousPriority: ticket.priority,
          newPriority: priority,
          slaDueAt: slaDueAt.toISOString(),
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
}

async function updateStatus(
  ticketIdValue: unknown,
  adminUserId: string,
  input: { status?: unknown; resolutionMessage?: unknown; reason?: unknown },
  context: AdminRequestContext,
) {
  const ticketId = requiredId(ticketIdValue, "Ticket ID");
  const status = requiredEnum(input.status, statuses, "status");
  const reason = boundedText(input.reason, "Audit reason", 10, 500);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Support ticket not found", "TICKET_NOT_FOUND");
  if (!allowedTransition(ticket.status, status)) {
    throw new ApiError(
      409,
      `Ticket cannot move from ${ticket.status} to ${status}`,
      "INVALID_TICKET_STATUS_TRANSITION",
    );
  }

  const resolutionMessage =
    status === "resolved" || status === "closed"
      ? boundedText(
          input.resolutionMessage ?? ticket.resolutionMessage,
          "Customer-visible resolution",
          10,
          1000,
        )
      : null;
  const now = new Date();
  const data: Prisma.SupportTicketUpdateInput = {
    status,
    ...(status === "in_progress"
      ? {
          firstResponseAt: ticket.firstResponseAt ?? now,
          resolvedAt: null,
          closedAt: null,
          resolutionMessage: null,
        }
      : status === "resolved"
        ? {
            firstResponseAt: ticket.firstResponseAt ?? now,
            resolvedAt: now,
            closedAt: null,
            resolutionMessage,
          }
        : {
            firstResponseAt: ticket.firstResponseAt ?? now,
            resolvedAt: ticket.resolvedAt ?? now,
            closedAt: now,
            resolutionMessage,
          }),
  };

  const updated=await prisma.$transaction(async (transaction) => {
    const updated = await transaction.supportTicket.update({
      where: { id: ticketId },
      data,
      select: ticketListSelect,
    });
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "SUPPORT_TICKET_STATUS_CHANGED",
        resourceType: "SupportTicket",
        resourceId: ticketId,
        metadata: {
          reason,
          previousStatus: ticket.status,
          newStatus: status,
          hasCustomerResolution: Boolean(resolutionMessage),
        },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return updated;
  });
  await recordCustomerActivity({userId:ticket.userId,eventType:"SUPPORT_TICKET_STATUS_CHANGED",metadata:{ticketId,status}});publishPlatformChange({type:"ticket",action:"status_changed",resourceId:ticketId});return updated;
}

async function addNote(
  ticketIdValue: unknown,
  adminUserId: string,
  bodyValue: unknown,
  context: AdminRequestContext,
) {
  const ticketId = requiredId(ticketIdValue, "Ticket ID");
  const body = boundedText(bodyValue, "Internal note", 5, 2000);
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new ApiError(404, "Support ticket not found", "TICKET_NOT_FOUND");

  return prisma.$transaction(async (transaction) => {
    const note = await transaction.supportTicketNote.create({
      data: { ticketId, adminUserId, body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        adminUser: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    if (!ticket.firstResponseAt) {
      await transaction.supportTicket.update({
        where: { id: ticketId },
        data: { firstResponseAt: new Date() },
      });
    }
    await transaction.adminAuditLog.create({
      data: {
        adminUserId,
        action: "SUPPORT_TICKET_NOTE_ADDED",
        resourceType: "SupportTicket",
        resourceId: ticketId,
        metadata: { noteId: note.id, bodyLength: body.length },
        ipAddress: context.ipAddress ?? null,
        userAgent: context.userAgent ?? null,
      },
    });
    return note;
  });
}

export const adminTicketsService = {
  list,
  getSummary,
  getById,
  listAssignees,
  assign,
  updatePriority,
  updateStatus,
  addNote,
};
