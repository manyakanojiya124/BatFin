export type FinanceEntryType = "PAYMENT" | "REFUND" | "ADJUSTMENT";
export type FinanceStatus = "pending" | "completed" | "failed";
export type FinanceDirection = "CREDIT" | "DEBIT";
export type FinancePaymentMethod = "UPI" | "CARD" | "NET_BANKING";
export type FinanceSource =
  | "system"
  | "customer_payment"
  | "admin_adjustment"
  | "admin_refund";

export interface FinanceCustomer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  accountStatus: string;
}

export interface FinanceAdminActor {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface RelatedFinanceTransaction {
  id: string;
  userId: string;
  type: FinanceEntryType;
  amount: number;
  direction: FinanceDirection;
  description: string | null;
  status: FinanceStatus;
  providerReference: string | null;
  paymentMethod: FinancePaymentMethod | null;
  source: FinanceSource;
  originalTransactionId: string | null;
  createdByAdminId: string | null;
  adminReason: string | null;
  transactionDate: string;
  updatedAt: string;
  createdByAdmin?: FinanceAdminActor | null;
}

export interface RefundSummary {
  refundedAmount: number;
  remainingRefundable: number;
  state: "not_refunded" | "partially_refunded" | "fully_refunded";
}

export interface FinanceTransaction extends RelatedFinanceTransaction {
  assetId: string | null;
  user: FinanceCustomer;
  createdByAdmin: FinanceAdminActor | null;
  originalTransaction: RelatedFinanceTransaction | null;
  reversals: RelatedFinanceTransaction[];
  refundSummary: RefundSummary | null;
  customerBalance?: number;
}

export interface FinanceSummary {
  completedPayments: { count: number; amount: number };
  pendingPayments: { count: number; amount: number };
  failedPayments: { count: number; amount: number };
  refundsThisMonth: { count: number; amount: number; startsAt: string };
  adjustmentsThisMonth: {
    count: number;
    credits: number;
    debits: number;
    startsAt: string;
  };
}

export interface FinanceFilters {
  q?: string;
  status?: FinanceStatus | "";
  type?: FinanceEntryType | "";
  direction?: FinanceDirection | "";
  method?: FinancePaymentMethod | "";
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
}

export interface AdjustmentResult {
  transaction: FinanceTransaction;
  customer: {
    id: string;
    name: string;
    accountStatus: string;
    balanceBefore: number;
    balanceAfter: number;
  };
}

export interface RefundResult {
  refund: FinanceTransaction;
  originalPaymentId: string;
  refundedAmount: number;
  remainingRefundable: number;
  customerBalance: number;
}
