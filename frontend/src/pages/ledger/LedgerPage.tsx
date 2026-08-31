import {
  AlertTriangle,
  BadgeIndianRupee,
  Bolt,
  CarFront,
  CircleParking,
  CreditCard,
  FileText,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  WalletCards,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { BottomNavigation } from "../../components/BottomNavigation";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import {
  ApiClientError,
  getLedgerSummary,
  listTransactions,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type {
  LedgerSummary,
  Transaction as LedgerTransaction,
  TransactionType,
} from "../../types/api";

interface FilterOption {
  label: string;
  type?: TransactionType;
}

const filters: FilterOption[] = [
  { label: "All" },
  { label: "Payments", type: "PAYMENT" },
  { label: "Rentals", type: "RENTAL" },
  { label: "Penalties", type: "PENALTY" },
  { label: "Charging", type: "CHARGING" },
  { label: "Refunds", type: "REFUND" },
];

const transactionLabels: Record<TransactionType, string> = {
  RENTAL: "Lease Payment",
  PAYMENT: "Wallet Recharge",
  PENALTY: "Penalty",
  INSURANCE: "Insurance",
  REFUND: "Payment Refund",
  ADJUSTMENT: "Account Adjustment",
  DEPOSIT: "Deposit",
  SECURITY: "Security Deposit",
  PROCESSING_FEE: "Processing Fee",
  CHALLAN: "Challan",
  AMC: "Maintenance",
  PARKING: "Parking",
  CHARGING: "Battery Charging",
};

const transactionVisuals: Record<
  TransactionType,
  { icon: LucideIcon; className: string }
> = {
  RENTAL: { icon: CarFront, className: "bg-surface-container-high text-on-surface-variant" },
  PAYMENT: { icon: WalletCards, className: "bg-secondary/10 text-secondary" },
  PENALTY: { icon: AlertTriangle, className: "bg-error-container text-error" },
  INSURANCE: { icon: ShieldCheck, className: "bg-secondary/10 text-secondary" },
  REFUND: { icon: RotateCcw, className: "bg-success/10 text-primary" },
  ADJUSTMENT: { icon: BadgeIndianRupee, className: "bg-secondary/10 text-secondary" },
  DEPOSIT: { icon: BadgeIndianRupee, className: "bg-success/10 text-primary" },
  SECURITY: { icon: ShieldCheck, className: "bg-primary/10 text-primary" },
  PROCESSING_FEE: { icon: FileText, className: "bg-surface-container text-on-surface-variant" },
  CHALLAN: { icon: AlertTriangle, className: "bg-error-container text-error" },
  AMC: { icon: Wrench, className: "bg-warning/10 text-warning" },
  PARKING: { icon: CircleParking, className: "bg-surface-container text-on-surface-variant" },
  CHARGING: { icon: Bolt, className: "bg-tertiary-fixed text-primary" },
};

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "BF"
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function indiaDateKey(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function groupLabel(key: string) {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);

  if (key === indiaDateKey(today)) return "Today";
  if (key === indiaDateKey(yesterday)) return "Yesterday";

  const [year, month, day] = key.split("-").map(Number);
  const date = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1, 6));
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  }).format(date);
}

function LedgerSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-5 md:grid-cols-12">
        <LoadingSkeleton className="h-48 rounded-card md:col-span-7" />
        <LoadingSkeleton className="h-48 rounded-card md:col-span-5" />
      </div>
      <LoadingSkeleton className="h-11 w-full rounded-xl" />
      <LoadingSkeleton className="h-64 rounded-card" />
    </div>
  );
}

function TransactionRow({ transaction }: { transaction: LedgerTransaction }) {
  const visual = transactionVisuals[transaction.type];
  const Icon = visual.icon;
  const isCredit = transaction.direction === "CREDIT";
  const isPenalty = transaction.type === "PENALTY" || transaction.type === "CHALLAN";

  return (
    <div className="flex items-center justify-between gap-3 border-b border-surface-container-low p-4 last:border-0 sm:gap-5 sm:p-5">
      <div className="flex min-w-0 items-center gap-3 sm:gap-4">
        <div className={`grid size-11 shrink-0 place-items-center rounded-full sm:size-12 ${visual.className}`}>
          <Icon aria-hidden="true" className="size-5 sm:size-6" />
        </div>
        <div className="min-w-0">
          <p className="truncate font-semibold text-text-primary">
            {transactionLabels[transaction.type]}
          </p>
          <p className="mt-0.5 truncate text-xs text-text-secondary sm:text-sm">
            {transaction.description || "BatFIN transaction"}
          </p>
          {transaction.status !== "completed" ? (
            <span className="mt-1 inline-block rounded-full bg-warning/10 px-2 py-0.5 text-[10px] font-semibold capitalize text-warning">
              {transaction.status}
            </span>
          ) : null}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-semibold tabular-nums sm:text-base ${
            isCredit ? "text-primary" : isPenalty ? "text-error" : "text-text-primary"
          }`}
        >
          {isCredit ? "+" : "−"} {formatCurrency(transaction.amount)}
        </p>
        <p className="mt-1 text-xs tabular-nums text-text-secondary">
          {new Intl.DateTimeFormat("en-IN", {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
            timeZone: "Asia/Kolkata",
          }).format(new Date(transaction.transactionDate))}
        </p>
      </div>
    </div>
  );
}

export function LedgerPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [filter, setFilter] = useState<TransactionType | undefined>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadLedger = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const [transactionResult, summaryResult] = await Promise.all([
        listTransactions(token, filter),
        getLedgerSummary(token),
      ]);
      setTransactions(transactionResult.transactions);
      setSummary(summaryResult.summary);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load your transaction ledger.",
      );
    } finally {
      setLoading(false);
    }
  }, [filter, logout, navigate, token]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  const groupedTransactions = useMemo(() => {
    const groups = new Map<string, LedgerTransaction[]>();

    for (const transaction of transactions) {
      const key = indiaDateKey(new Date(transaction.transactionDate));
      const group = groups.get(key) ?? [];
      group.push(transaction);
      groups.set(key, group);
    }

    return [...groups.entries()];
  }, [transactions]);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate("/dashboard")}
        title="BatFIN"
      />
      <main className="page-enter mx-auto w-full max-w-app px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <div className="mb-7">
          <p className="text-sm font-medium text-text-secondary">Payments and usage</p>
          <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary sm:text-4xl">
            Transaction Ledger
          </h1>
        </div>

        {loading && !summary ? (
          <LedgerSkeleton />
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load ledger</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadLedger()}>
              Try again
            </Button>
          </Card>
        ) : summary ? (
          <>
            <div className="grid gap-5 md:grid-cols-12">
              <Card className="relative min-h-48 overflow-hidden p-6 md:col-span-7 md:p-8" tone="dark">
                <div className="absolute -right-10 -top-10 size-48 rounded-full bg-success/20 blur-3xl" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div>
                    <p className="text-sm font-medium text-tertiary-fixed-dim">
                      Available Wallet Balance
                    </p>
                    <p className="mt-3 break-words font-heading text-4xl font-bold tabular-nums text-white sm:text-5xl">
                      {formatCurrency(summary.currentBalance)}
                    </p>
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-white/65">
                      Completed credits less completed debits
                    </p>
                    <Link
                      className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-container px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary active:scale-[0.98]"
                      to="/payments"
                    >
                      <WalletCards aria-hidden="true" className="size-4" />
                      Recharge
                    </Link>
                  </div>
                </div>
              </Card>

              <Card className="p-6 md:col-span-5">
                <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                  This month
                </p>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div className="rounded-2xl bg-success/10 p-4">
                    <p className="text-xs font-medium text-text-secondary">Credits</p>
                    <p className="mt-2 font-semibold tabular-nums text-primary">
                      +{formatCurrency(summary.thisMonth.credits)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-error/10 p-4">
                    <p className="text-xs font-medium text-text-secondary">Debits</p>
                    <p className="mt-2 font-semibold tabular-nums text-error">
                      −{formatCurrency(summary.thisMonth.debits)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-surface-container pt-4 text-sm">
                  <span className="text-text-secondary">Monthly net</span>
                  <strong
                    className={`tabular-nums ${summary.thisMonth.net >= 0 ? "text-primary" : "text-error"}`}
                  >
                    {formatCurrency(summary.thisMonth.net)}
                  </strong>
                </div>
              </Card>
            </div>

            <section className="hide-scrollbar mt-7 overflow-x-auto pb-2" aria-label="Transaction filters">
              <div className="flex w-max gap-3 px-0.5">
                {filters.map((option) => {
                  const selected = filter === option.type;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`min-h-10 whitespace-nowrap rounded-full px-5 py-2 text-sm font-semibold shadow-card transition active:scale-[0.98] ${
                        selected
                          ? "bg-primary text-white"
                          : "bg-white text-on-surface-variant hover:bg-surface-container-low"
                      }`}
                      key={option.label}
                      onClick={() => setFilter(option.type)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </section>

            <section className="mt-5 space-y-6" aria-live="polite">
              {loading ? (
                <LoadingSkeleton className="h-56 rounded-card" />
              ) : groupedTransactions.length === 0 ? (
                <Card className="px-6 py-12 text-center">
                  <CreditCard aria-hidden="true" className="mx-auto size-10 text-text-secondary" />
                  <h2 className="mt-4 font-heading text-xl font-semibold text-text-primary">
                    No transactions found
                  </h2>
                  <p className="mt-2 text-sm text-text-secondary">
                    {filter
                      ? "There are no transactions matching this filter."
                      : "Your completed transactions will appear here."}
                  </p>
                </Card>
              ) : (
                groupedTransactions.map(([date, group]) => (
                  <div key={date}>
                    <h2 className="mb-3 px-2 text-sm font-semibold text-text-secondary">
                      {groupLabel(date)}
                    </h2>
                    <Card className="overflow-hidden">
                      {group.map((transaction) => (
                        <TransactionRow key={transaction.id} transaction={transaction} />
                      ))}
                    </Card>
                  </div>
                ))
              )}
            </section>
          </>
        ) : null}
      </main>
      <BottomNavigation active="payments" />
    </div>
  );
}
