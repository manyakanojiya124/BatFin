import type { PortfolioAccountListItem, PortfolioSummary } from "./portfolio";
export type CustomerStatus = "active" | "suspended" | "closed";

export interface CustomerListItem {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  address: string | null;
  accountStatus: CustomerStatus;
  lastLoginAt: string | null;
  lastActivityAt: string | null;
  createdAt: string;
  updatedAt: string;
  _count: {
    assets: number;
    subscriptions: number;
    transactions: number;
    tickets: number;
    portfolioAccounts: number;
  };
}

export interface CustomerAsset {
  id: string;
  assetType: string;
  productType: string;
  serialNumber: string;
  vehicleNumber: string | null;
  status: string;
  inventoryStatus: string;
  batteryLevel: number | null;
  temperature: number | null;
  latitude: number | null;
  longitude: number | null;
  createdAt: string;
}

export interface CustomerSubscription {
  id: string;
  status: string;
  startDate: string;
  asset: {
    id: string;
    productType: string;
    serialNumber: string;
  };
  plan: {
    id: string;
    name: string;
    type: string;
    billingCycle: string;
  };
}

export interface CustomerTicket {
  id: string;
  assetId: string | null;
  type: string;
  description: string;
  status: string;
  createdAt: string;
}

export interface CustomerTransaction {
  id: string;
  assetId: string | null;
  type: string;
  amount: number;
  direction: "DEBIT" | "CREDIT";
  description: string | null;
  status: string;
  transactionDate: string;
}

export interface CustomerDetail extends CustomerListItem {
  assets: CustomerAsset[];
  subscriptions: CustomerSubscription[];
  tickets: CustomerTicket[];
  transactions: CustomerTransaction[];
  portfolioAccounts: PortfolioAccountListItem[];
  financialSummary: {
    totalCredits: number;
    totalDebits: number;
    currentBalance: number;
  };
}

export interface CustomerPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AdminDashboardMetrics {
  generatedAt: string;
  customers: {
    total: number;
    active: number;
    suspended: number;
    closed: number;
    newThisMonth: number;
  };
  assets: {
    total: number;
    assigned: number;
    unassigned: number;
    locked: number;
  };
  subscriptions: { total: number; active: number; closed: number };
  activeSubscriptions: number;
  tickets: { open: number; inProgress: number; resolved: number; closed: number; highPriority: number };
  openTickets: number;
  paymentsThisMonth: {
    count: number;
    amount: number;
    startsAt: string;
  };
  recentCustomers: Array<{
    id: string;
    name: string;
    phone: string;
    accountStatus: CustomerStatus;
    lastLoginAt: string | null;
    lastActivityAt: string | null;
    createdAt: string;
    _count: { assets: number; portfolioAccounts: number };
  }>;
  portfolio: PortfolioSummary & { recentAccounts: PortfolioAccountListItem[] };
}
