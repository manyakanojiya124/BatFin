export interface User {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  accountStatus: "active" | "suspended" | "closed";
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export type AssetType = "battery" | "vehicle";
export type AssetStatus = "active" | "locked" | "inactive";

export interface Asset {
  id: string;
  userId: string;
  assetType: AssetType;
  productType: string;
  serialNumber: string;
  vehicleNumber: string | null;
  status: AssetStatus;
  latitude: number | null;
  longitude: number | null;
  batteryLevel: number | null;
  temperature: number | null;
  createdAt: string;
}

export interface AssetLocation {
  assetId: string;
  latitude: number | null;
  longitude: number | null;
  available: boolean;
}

export interface AssetHealth {
  batteryLevel: number;
  temperature: number;
  status: "healthy" | "attention" | "service_required";
  serviceRequired: boolean;
}

export interface CreateAssetInput {
  serialNumber: string;
  assetType: AssetType;
  productType: string;
}

export type PlanType = "PREPAID" | "POSTPAID";

export interface Plan {
  id: string;
  name: string;
  type: PlanType;
  billingCycle: string;
  minimumBalance: number | null;
  creditLimit: number | null;
  pricePerKm: number | null;
  pricePerKwh: number | null;
  status: string;
}

export interface Subscription {
  id: string;
  userId: string;
  assetId: string;
  planId: string;
  startDate: string;
  status: string;
  asset: Pick<
    Asset,
    "id" | "assetType" | "productType" | "serialNumber" | "status"
  >;
  plan: Plan;
}

export type TransactionType =
  | "RENTAL"
  | "PAYMENT"
  | "PENALTY"
  | "INSURANCE"
  | "REFUND"
  | "ADJUSTMENT"
  | "DEPOSIT"
  | "SECURITY"
  | "PROCESSING_FEE"
  | "CHALLAN"
  | "AMC"
  | "PARKING"
  | "CHARGING";

export interface Transaction {
  id: string;
  userId: string;
  assetId: string | null;
  type: TransactionType;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  description: string | null;
  status: string;
  transactionDate: string;
}

export interface LedgerSummary {
  currentBalance: number;
  totalCredits: number;
  totalDebits: number;
  thisMonth: {
    credits: number;
    debits: number;
    net: number;
    startsAt: string;
  };
}

export type PaymentMethod = "UPI" | "CARD" | "NET_BANKING";

export interface Payment {
  transactionId: string;
  amount: number;
  method: PaymentMethod;
  providerReference: string | null;
  status: string;
  transactionDate: string;
  description: string | null;
}

export type SupportTicketType =
  | "ACCIDENT"
  | "HEALTH_ISSUE"
  | "LEASE_PAUSE"
  | "NOC_TRANSFER"
  | "COMPLAINT"
  | "FORECLOSURE"
  | "REPORT_ISSUE"
  | "OTHER";

export interface SupportTicket {
  id: string;
  userId: string;
  assetId: string | null;
  type: SupportTicketType;
  description: string;
  priority: "low" | "normal" | "high" | "critical";
  status: "open" | "in_progress" | "resolved" | "closed";
  resolutionMessage: string | null;
  slaDueAt: string | null;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSession {
  token: string;
  user: User;
}

export interface ApiErrorPayload {
  error: {
    code: string;
    message: string;
  };
}

export interface UpdateProfileInput {
  name?: string;
  email?: string | null;
  address?: string | null;
}
