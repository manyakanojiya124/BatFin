import type { CustomerStatus } from "./customer";

export type TicketStatus = "open" | "in_progress" | "resolved" | "closed";
export type TicketPriority = "low" | "normal" | "high" | "critical";

export interface AdminTicket {
  id: string;
  userId: string;
  assetId: string | null;
  assignedAdminId: string | null;
  type: string;
  description: string;
  priority: TicketPriority;
  status: TicketStatus;
  resolutionMessage: string | null;
  slaDueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: {
    id: string;
    name: string;
    phone: string;
    email: string | null;
    accountStatus: CustomerStatus;
  };
  asset: {
    id: string;
    productType: string;
    serialNumber: string;
    status: string;
    inventoryStatus: string;
  } | null;
  assignedAdmin: TicketAssignee | null;
  _count: { notes: number };
}

export interface TicketAssignee {
  id: string;
  name: string;
  email: string;
  role: string;
  status?: string;
}

export interface TicketNote {
  id: string;
  body: string;
  createdAt: string;
  adminUser: TicketAssignee;
}

export interface AdminTicketDetail extends AdminTicket {
  notes: TicketNote[];
}

export interface TicketSummary {
  open: number;
  inProgress: number;
  overdue: number;
  critical: number;
  unassigned: number;
  resolvedToday: number;
}
