import {
  AlertCircle,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  Download,
  FileSearch,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  UserRoundSearch,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AdminApiError,
  createAdminAdjustment,
  downloadAdminFinanceExport,
  getAdminAccessSummary,
  getAdminPaymentSummary,
  listAdminCustomers,
  listAdminPayments,
  lookupAdminProviderReference,
  verifyAdminStepUp,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AdminAccessSummary } from "../../types/admin";
import type {
  CustomerListItem,
  CustomerPagination,
} from "../../types/customer";
import type {
  FinanceDirection,
  FinanceEntryType,
  FinanceStatus,
  FinanceSummary,
  FinanceTransaction,
} from "../../types/payment";

const statusStyles: Record<FinanceStatus, string> = {
  completed: "bg-green-50 text-primary",
  pending: "bg-amber-50 text-warning",
  failed: "bg-red-50 text-error",
};

const entryStyles: Record<FinanceEntryType, string> = {
  PAYMENT: "bg-blue-50 text-secondary",
  REFUND: "bg-purple-50 text-purple-700",
  ADJUSTMENT: "bg-teal-50 text-teal-700",
};

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function requestKey() {
  return window.crypto.randomUUID();
}

export function AdminPaymentsPage() {
  const navigate = useNavigate();
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const clearSession = useAdminStore((state) => state.clearSession);
  const [transactions, setTransactions] = useState<FinanceTransaction[]>([]);
  const [summary, setSummary] = useState<FinanceSummary | null>(null);
  const [access, setAccess] = useState<AdminAccessSummary | null>(null);
  const [pagination, setPagination] = useState<CustomerPagination>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [entryType, setEntryType] = useState("");
  const [direction, setDirection] = useState("");
  const [method, setMethod] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [providerReference, setProviderReference] = useState("");
  const [lookupLoading, setLookupLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);

  const activeFilters = {
    q: query,
    status: status as FinanceStatus | "",
    type: entryType as FinanceEntryType | "",
    direction: direction as FinanceDirection | "",
    method: method as "UPI" | "CARD" | "NET_BANKING" | "",
    dateFrom,
    dateTo,
  };

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, stats] = await Promise.all([
        listAdminPayments({
          q: query,
          status: status as FinanceStatus | "",
          type: entryType as FinanceEntryType | "",
          direction: direction as FinanceDirection | "",
          method: method as "UPI" | "CARD" | "NET_BANKING" | "",
          dateFrom,
          dateTo,
          page,
          pageSize: 20,
        }),
        getAdminPaymentSummary(),
      ]);
      setTransactions(list.transactions);
      setPagination(list.pagination);
      setSummary(stats.summary);
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load payment monitoring",
      );
    } finally {
      setLoading(false);
    }
  }, [
    clearSession,
    dateFrom,
    dateTo,
    direction,
    entryType,
    method,
    navigate,
    page,
    query,
    status,
  ]);

  useEffect(() => {
    void getAdminAccessSummary()
      .then(setAccess)
      .catch((requestError: unknown) => {
        if (requestError instanceof AdminApiError && requestError.status === 401) {
          clearSession();
          navigate("/login", { replace: true });
        }
      });
  }, [clearSession, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  async function lookupProvider(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!providerReference.trim()) return;
    setLookupLoading(true);
    setError("");
    try {
      const result = await lookupAdminProviderReference(providerReference);
      navigate(`/payments/${result.transaction.id}`);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Provider reference lookup failed",
      );
    } finally {
      setLookupLoading(false);
    }
  }

  async function exportTransactions() {
    setExporting(true);
    setError("");
    try {
      const result = await downloadAdminFinanceExport(activeFilters);
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.fileName;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setNotice("Filtered finance export downloaded and audited.");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to export finance records",
      );
    } finally {
      setExporting(false);
    }
  }

  const canExport = access?.permissions.includes("payments.export") ?? false;
  const canAdjust = access?.permissions.includes("payments.adjust") ?? false;
  const cards: Array<{
    label: string;
    value: string;
    note: string;
    icon: LucideIcon;
    tone: string;
  }> = summary
    ? [
        {
          label: "Completed payments",
          value: formatCurrency(summary.completedPayments.amount),
          note: `${summary.completedPayments.count} provider credits`,
          icon: CheckCircle2,
          tone: "bg-green-50 text-primary",
        },
        {
          label: "Pending",
          value: formatCurrency(summary.pendingPayments.amount),
          note: `${summary.pendingPayments.count} awaiting settlement`,
          icon: RefreshCw,
          tone: "bg-amber-50 text-warning",
        },
        {
          label: "Failed",
          value: formatCurrency(summary.failedPayments.amount),
          note: `${summary.failedPayments.count} unsuccessful attempts`,
          icon: AlertCircle,
          tone: "bg-red-50 text-error",
        },
        {
          label: "Refunded this month",
          value: formatCurrency(summary.refundsThisMonth.amount),
          note: `${summary.refundsThisMonth.count} linked reversals`,
          icon: RotateCcw,
          tone: "bg-purple-50 text-purple-700",
        },
      ]
    : [];

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-sm text-text-secondary">Finance operations</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary">
              Payment monitoring
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              Reconcile provider references, inspect settlement status, export controlled finance data, and run step-up protected adjustments and refunds.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canExport ? (
              <button
                className="action-btn"
                disabled={exporting}
                onClick={() => void exportTransactions()}
                type="button"
              >
                <Download className="size-4" />
                {exporting ? "Exporting…" : "Export CSV"}
              </button>
            ) : null}
            {canAdjust ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white"
                onClick={() => setAdjustmentOpen(true)}
                type="button"
              >
                <Plus className="size-4" /> New adjustment
              </button>
            ) : null}
          </div>
        </div>

        <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(({ label, value, note, icon: Icon, tone }) => (
            <article
              className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card"
              key={label}
            >
              <span className={`grid size-11 place-items-center rounded-xl ${tone}`}>
                <Icon className="size-5" />
              </span>
              <p className="mt-4 text-sm text-text-secondary">{label}</p>
              <p className="mt-1 font-heading text-2xl font-semibold">{value}</p>
              <p className="mt-1 text-xs text-text-secondary">{note}</p>
            </article>
          ))}
        </section>

        {summary ? (
          <section className="mt-4 flex flex-col gap-3 rounded-2xl bg-forest px-5 py-4 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <SlidersHorizontal className="size-5 text-green-300" />
              <div>
                <p className="text-sm font-semibold">Adjustments this month</p>
                <p className="text-xs text-white/60">
                  {summary.adjustmentsThisMonth.count} audited entries
                </p>
              </div>
            </div>
            <div className="flex gap-5 text-sm tabular-nums">
              <span className="text-green-300">
                Credits +{formatCurrency(summary.adjustmentsThisMonth.credits)}
              </span>
              <span className="text-red-300">
                Debits −{formatCurrency(summary.adjustmentsThisMonth.debits)}
              </span>
            </div>
          </section>
        ) : null}

        {notice ? (
          <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary" role="status">
            <CheckCircle2 className="size-5 shrink-0" /> {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-red-50 p-4 text-sm text-error" role="alert">
            <span className="flex gap-3">
              <AlertCircle className="size-5 shrink-0" /> {error}
            </span>
            <button onClick={() => void load()} type="button">
              <RefreshCw className="size-4" />
            </button>
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 rounded-2xl border border-outline/70 bg-white p-4 shadow-card lg:grid-cols-[minmax(0,1fr)_minmax(300px,0.65fr)]">
          <form className="flex gap-2" onSubmit={submitSearch}>
            <label className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-secondary" />
              <input
                className="min-h-12 w-full rounded-xl border border-outline py-3 pl-12 pr-3"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Transaction, customer, phone or reference"
                value={searchInput}
              />
            </label>
            <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white" type="submit">
              Search
            </button>
          </form>
          <form className="flex gap-2" onSubmit={lookupProvider}>
            <label className="relative min-w-0 flex-1">
              <FileSearch className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-secondary" />
              <input
                className="min-h-12 w-full rounded-xl border border-outline py-3 pl-12 pr-3 font-mono text-sm uppercase"
                onChange={(event) => setProviderReference(event.target.value.toUpperCase())}
                placeholder="Exact provider reference"
                value={providerReference}
              />
            </label>
            <button className="action-btn" disabled={lookupLoading} type="submit">
              Lookup
            </button>
          </form>
        </section>

        <section className="mt-4 grid gap-3 rounded-2xl border border-outline/70 bg-white p-4 shadow-card sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Filter
            label="All statuses"
            onChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
            options={[
              ["completed", "Completed"],
              ["pending", "Pending"],
              ["failed", "Failed"],
            ]}
            value={status}
          />
          <Filter
            label="All entry types"
            onChange={(value) => {
              setEntryType(value);
              setPage(1);
            }}
            options={[
              ["PAYMENT", "Payment"],
              ["REFUND", "Refund"],
              ["ADJUSTMENT", "Adjustment"],
            ]}
            value={entryType}
          />
          <Filter
            label="All directions"
            onChange={(value) => {
              setDirection(value);
              setPage(1);
            }}
            options={[
              ["CREDIT", "Credit"],
              ["DEBIT", "Debit"],
            ]}
            value={direction}
          />
          <Filter
            label="All methods"
            onChange={(value) => {
              setMethod(value);
              setPage(1);
            }}
            options={[
              ["UPI", "UPI"],
              ["CARD", "Card"],
              ["NET_BANKING", "Net banking"],
            ]}
            value={method}
          />
          <DateInput
            label="From date"
            onChange={(value) => {
              setDateFrom(value);
              setPage(1);
            }}
            value={dateFrom}
          />
          <DateInput
            label="To date"
            onChange={(value) => {
              setDateTo(value);
              setPage(1);
            }}
            value={dateTo}
          />
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-outline/70 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-outline/70 px-5 py-4">
            <div>
              <h2 className="font-heading text-xl font-semibold">Finance entries</h2>
              <p className="mt-1 text-xs text-text-secondary">
                {pagination.total} matching records · newest first
              </p>
            </div>
            <CreditCard className="size-5 text-primary" />
          </div>
          {loading ? (
            <div className="grid min-h-64 place-items-center">
              <RefreshCw className="size-7 animate-spin text-primary" />
            </div>
          ) : transactions.length ? (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[980px] text-left text-sm">
                  <thead className="bg-background text-xs uppercase tracking-wide text-text-secondary">
                    <tr>
                      <th className="px-5 py-3 font-semibold">Transaction</th>
                      <th className="px-5 py-3 font-semibold">Customer</th>
                      <th className="px-5 py-3 font-semibold">Provider</th>
                      <th className="px-5 py-3 font-semibold">Status</th>
                      <th className="px-5 py-3 text-right font-semibold">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline/60">
                    {transactions.map((transaction) => (
                      <TransactionRow key={transaction.id} transaction={transaction} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-outline/60 md:hidden">
                {transactions.map((transaction) => (
                  <TransactionCard key={transaction.id} transaction={transaction} />
                ))}
              </div>
            </>
          ) : (
            <div className="px-5 py-16 text-center">
              <WalletCards className="mx-auto size-10 text-text-secondary" />
              <h3 className="mt-4 font-heading text-xl font-semibold">No matching finance entries</h3>
              <p className="mt-2 text-sm text-text-secondary">
                Clear or adjust the monitoring filters.
              </p>
            </div>
          )}
          <div className="flex items-center justify-between border-t border-outline/70 px-4 py-4 sm:px-5">
            <button
              className="page-btn"
              disabled={page <= 1 || loading}
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              type="button"
            >
              <ChevronLeft className="size-4" /> Previous
            </button>
            <span className="text-xs text-text-secondary">
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              className="page-btn"
              disabled={page >= pagination.totalPages || loading}
              onClick={() => setPage((current) => current + 1)}
              type="button"
            >
              Next <ChevronRight className="size-4" />
            </button>
          </div>
        </section>
      </div>

      {adjustmentOpen ? (
        <AdjustmentModal
          csrfToken={csrfToken}
          onClose={() => setAdjustmentOpen(false)}
          onComplete={async (message) => {
            setAdjustmentOpen(false);
            setNotice(message);
            await load();
          }}
        />
      ) : null}
    </main>
  );
}

function TransactionRow({ transaction }: { transaction: FinanceTransaction }) {
  return (
    <tr className="transition hover:bg-background/70">
      <td className="px-5 py-4">
        <Link className="font-semibold text-text-primary hover:text-primary" to={`/payments/${transaction.id}`}>
          {transaction.type.replaceAll("_", " ")}
        </Link>
        <p className="mt-1 font-mono text-[11px] text-text-secondary">{transaction.id}</p>
        <p className="mt-1 text-xs text-text-secondary">{formatDate(transaction.transactionDate)}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-medium">{transaction.user.name}</p>
        <p className="mt-1 text-xs text-text-secondary">{transaction.user.phone}</p>
      </td>
      <td className="px-5 py-4">
        <p className="font-mono text-xs">{transaction.providerReference ?? "—"}</p>
        <p className="mt-1 text-xs text-text-secondary">
          {transaction.paymentMethod?.replaceAll("_", " ") ?? transaction.source.replaceAll("_", " ")}
        </p>
      </td>
      <td className="px-5 py-4">
        <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[transaction.status]}`}>
          {transaction.status}
        </span>
        {transaction.refundSummary?.state !== "not_refunded" ? (
          <p className="mt-2 text-[11px] capitalize text-purple-700">
            {transaction.refundSummary?.state.replaceAll("_", " ")}
          </p>
        ) : null}
      </td>
      <td className="px-5 py-4 text-right">
        <p className={`font-semibold tabular-nums ${transaction.direction === "CREDIT" ? "text-primary" : "text-error"}`}>
          {transaction.direction === "CREDIT" ? "+" : "−"}{formatCurrency(transaction.amount)}
        </p>
        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-semibold ${entryStyles[transaction.type]}`}>
          {transaction.type}
        </span>
      </td>
    </tr>
  );
}

function TransactionCard({ transaction }: { transaction: FinanceTransaction }) {
  return (
    <Link className="block p-4" to={`/payments/${transaction.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold ${entryStyles[transaction.type]}`}>
              {transaction.type}
            </span>
            <span className={`rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${statusStyles[transaction.status]}`}>
              {transaction.status}
            </span>
          </div>
          <p className="mt-3 truncate font-semibold">{transaction.user.name}</p>
          <p className="mt-1 font-mono text-[11px] text-text-secondary">
            {transaction.providerReference ?? transaction.id}
          </p>
        </div>
        <p className={`shrink-0 font-semibold tabular-nums ${transaction.direction === "CREDIT" ? "text-primary" : "text-error"}`}>
          {transaction.direction === "CREDIT" ? "+" : "−"}{formatCurrency(transaction.amount)}
        </p>
      </div>
      <p className="mt-3 text-xs text-text-secondary">{formatDate(transaction.transactionDate)}</p>
    </Link>
  );
}

function AdjustmentModal({
  csrfToken,
  onClose,
  onComplete,
}: {
  csrfToken: string | null;
  onClose: () => void;
  onComplete: (message: string) => Promise<void>;
}) {
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<CustomerListItem[]>([]);
  const [selected, setSelected] = useState<CustomerListItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [direction, setDirection] = useState<FinanceDirection>("CREDIT");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [key] = useState(requestKey);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function searchCustomers() {
    if (customerQuery.trim().length < 2) {
      setError("Enter at least two characters to find a customer.");
      return;
    }
    setSearching(true);
    setError("");
    try {
      const result = await listAdminCustomers({
        q: customerQuery.trim(),
        page: 1,
        pageSize: 6,
      });
      setCustomers(result.customers);
      if (!result.customers.length) setError("No matching customers found.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Customer search failed");
    } finally {
      setSearching(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !selected) {
      setError("Select a customer before creating the adjustment.");
      return;
    }
    setWorking(true);
    setError("");
    try {
      await verifyAdminStepUp(csrfToken, code);
      const result = await createAdminAdjustment(csrfToken, {
        userId: selected.id,
        direction,
        amount: Number(amount),
        reason,
        description: description.trim() || undefined,
        idempotencyKey: key,
      });
      await onComplete(
        `${direction === "CREDIT" ? "Credit" : "Debit"} adjustment ${formatCurrency(result.transaction.amount)} completed for ${selected.name}. New balance: ${formatCurrency(result.customer.balanceAfter)}.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Adjustment failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal onClose={() => !working && onClose()} title="Create wallet adjustment">
      <form className="space-y-5" onSubmit={submit}>
        {error ? <ErrorMessage text={error} /> : null}
        <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
          This writes a completed ledger entry in a serializable PostgreSQL transaction. A reason, unique request key, and fresh authenticator code are mandatory.
        </div>
        <div>
          <label className="text-sm font-medium">Find customer</label>
          <div className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <UserRoundSearch className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-secondary" />
              <input
                className="min-h-12 w-full rounded-xl border border-outline pl-10 pr-3"
                onChange={(event) => setCustomerQuery(event.target.value)}
                placeholder="Name, phone or email"
                value={customerQuery}
              />
            </div>
            <button
              className="action-btn"
              disabled={searching}
              onClick={() => void searchCustomers()}
              type="button"
            >
              Find
            </button>
          </div>
          {customers.length ? (
            <div className="mt-3 max-h-44 space-y-2 overflow-y-auto">
              {customers.map((customer) => (
                <button
                  className={`flex w-full items-center justify-between rounded-xl border p-3 text-left ${selected?.id === customer.id ? "border-primary bg-green-50" : "border-outline"}`}
                  key={customer.id}
                  onClick={() => setSelected(customer)}
                  type="button"
                >
                  <span>
                    <span className="block text-sm font-semibold">{customer.name}</span>
                    <span className="mt-1 block text-xs text-text-secondary">{customer.phone}</span>
                  </span>
                  <span className="text-xs capitalize text-text-secondary">{customer.accountStatus}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm font-medium">
            Direction
            <select
              className="mt-2 min-h-12 w-full rounded-xl border border-outline bg-white px-3"
              onChange={(event) => setDirection(event.target.value as FinanceDirection)}
              value={direction}
            >
              <option value="CREDIT">Credit</option>
              <option value="DEBIT">Debit</option>
            </select>
          </label>
          <label className="text-sm font-medium">
            Amount (INR)
            <input
              className="mt-2 min-h-12 w-full rounded-xl border border-outline px-3"
              inputMode="decimal"
              max="100000"
              min="1"
              onChange={(event) => setAmount(event.target.value)}
              required
              step="0.01"
              type="number"
              value={amount}
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Customer ledger description <span className="text-text-secondary">(optional)</span>
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-outline px-3"
            maxLength={140}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="Safe customer-visible description"
            value={description}
          />
        </label>
        <label className="block text-sm font-medium">
          Private audit reason
          <textarea
            className="mt-2 min-h-24 w-full rounded-xl border border-outline p-3"
            maxLength={500}
            minLength={10}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </label>
        <label className="block text-sm font-medium">
          Authenticator code
          <input
            autoComplete="one-time-code"
            className="mt-2 min-h-12 w-full rounded-xl border border-outline px-3 font-mono tracking-[0.35em]"
            inputMode="numeric"
            maxLength={6}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
            pattern="\d{6}"
            required
            value={code}
          />
        </label>
        <button
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60"
          disabled={working || !selected}
          type="submit"
        >
          {direction === "CREDIT" ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
          {working ? "Verifying and posting…" : `Post ${direction.toLowerCase()} adjustment`}
        </button>
      </form>
    </Modal>
  );
}

function Filter({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
  value: string;
}) {
  return (
    <select
      aria-label={label}
      className="min-h-11 rounded-xl border border-outline bg-white px-3 text-sm"
      onChange={(event) => onChange(event.target.value)}
      value={value}
    >
      <option value="">{label}</option>
      {options.map(([key, text]) => (
        <option key={key} value={key}>{text}</option>
      ))}
    </select>
  );
}

function DateInput({
  label,
  onChange,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <label className="relative">
      <span className="pointer-events-none absolute left-3 top-1 text-[9px] font-semibold uppercase tracking-wide text-text-secondary">
        {label}
      </span>
      <input
        aria-label={label}
        className="min-h-11 w-full rounded-xl border border-outline px-3 pt-3 text-sm"
        onChange={(event) => onChange(event.target.value)}
        type="date"
        value={value}
      />
    </label>
  );
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-2xl font-semibold">{title}</h2>
          <button className="grid size-10 place-items-center rounded-full hover:bg-background" onClick={onClose} type="button">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

function ErrorMessage({ text }: { text: string }) {
  return (
    <div className="flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error">
      <AlertCircle className="size-5 shrink-0" /> {text}
    </div>
  );
}
