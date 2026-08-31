import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Copy,
  CreditCard,
  ExternalLink,
  FileClock,
  Fingerprint,
  Link2,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  UserRound,
  WalletCards,
  X,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  AdminApiError,
  createAdminRefund,
  getAdminAccessSummary,
  getAdminFinanceTransaction,
  verifyAdminStepUp,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AdminAccessSummary } from "../../types/admin";
import type {
  FinanceStatus,
  FinanceTransaction,
  RelatedFinanceTransaction,
} from "../../types/payment";

const statusStyles: Record<FinanceStatus, string> = {
  completed: "bg-green-50 text-primary",
  pending: "bg-amber-50 text-warning",
  failed: "bg-red-50 text-error",
};

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function date(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function AdminPaymentDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const clearSession = useAdminStore((state) => state.clearSession);
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const [transaction, setTransaction] = useState<FinanceTransaction | null>(null);
  const [access, setAccess] = useState<AdminAccessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [refundOpen, setRefundOpen] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [detail, accessResult] = await Promise.all([
        getAdminFinanceTransaction(id),
        getAdminAccessSummary(),
      ]);
      setTransaction(detail.transaction);
      setAccess(accessResult);
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load finance transaction",
      );
    } finally {
      setLoading(false);
    }
  }, [clearSession, id, navigate]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !transaction) {
    return (
      <main className="grid min-h-[70vh] place-items-center">
        <RefreshCw className="size-8 animate-spin text-primary" />
      </main>
    );
  }

  if (!transaction) {
    return (
      <main className="grid min-h-[70vh] place-items-center p-6 text-center">
        <div>
          <AlertCircle className="mx-auto size-10 text-error" />
          <h1 className="mt-4 font-heading text-2xl font-semibold">Finance entry unavailable</h1>
          <p className="mt-2 text-sm text-text-secondary">{error}</p>
          <button className="mt-5 font-semibold text-primary" onClick={() => void load()} type="button">
            Try again
          </button>
        </div>
      </main>
    );
  }

  const canRefund = access?.permissions.includes("payments.refund") ?? false;
  const refundable =
    transaction.type === "PAYMENT" &&
    transaction.status === "completed" &&
    Boolean(transaction.providerReference) &&
    (transaction.refundSummary?.remainingRefundable ?? 0) > 0;

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/payments">
          <ArrowLeft className="size-4" /> Payment monitoring
        </Link>

        <section className="mt-5 flex flex-col gap-6 rounded-3xl bg-white p-6 shadow-card lg:flex-row lg:items-start lg:justify-between lg:p-8">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-secondary">
                {transaction.type}
              </span>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[transaction.status]}`}>
                {transaction.status}
              </span>
              <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold capitalize text-text-secondary">
                {transaction.source.replaceAll("_", " ")}
              </span>
            </div>
            <h1 className={`mt-5 font-heading text-4xl font-semibold tabular-nums ${transaction.direction === "CREDIT" ? "text-primary" : "text-error"}`}>
              {transaction.direction === "CREDIT" ? "+" : "−"}{currency(transaction.amount)}
            </h1>
            <p className="mt-3 break-all font-mono text-xs text-text-secondary">{transaction.id}</p>
            <p className="mt-2 text-sm text-text-secondary">Posted {date(transaction.transactionDate)}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {transaction.providerReference ? (
              <button
                className="action-btn"
                onClick={() => {
                  void navigator.clipboard.writeText(transaction.providerReference ?? "");
                  setNotice("Provider reference copied.");
                }}
                type="button"
              >
                <Copy className="size-4" /> Copy reference
              </button>
            ) : null}
            {canRefund && refundable ? (
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-error px-4 text-sm font-semibold text-white"
                onClick={() => setRefundOpen(true)}
                type="button"
              >
                <RotateCcw className="size-4" /> Create refund
              </button>
            ) : null}
          </div>
        </section>

        {notice ? (
          <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary" role="status">
            <CheckCircle2 className="size-5" /> {notice}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-error" role="alert">
            <AlertCircle className="size-5" /> {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-6">
            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6">
              <div className="flex items-center gap-3">
                <Fingerprint className="size-5 text-primary" />
                <div>
                  <p className="text-sm text-text-secondary">Settlement identity</p>
                  <h2 className="font-heading text-xl font-semibold">Provider and ledger data</h2>
                </div>
              </div>
              <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                <Info label="Provider reference" mono value={transaction.providerReference ?? "Not applicable"} />
                <Info label="Payment method" value={transaction.paymentMethod?.replaceAll("_", " ") ?? "Not applicable"} />
                <Info label="Direction" value={transaction.direction} />
                <Info label="Status" value={transaction.status} />
                <Info label="Created" value={date(transaction.transactionDate)} />
                <Info label="Last updated" value={date(transaction.updatedAt)} />
              </dl>
              <div className="mt-6 rounded-xl bg-background p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Customer ledger description</p>
                <p className="mt-2 text-sm leading-6">{transaction.description ?? "No description"}</p>
              </div>
            </section>

            {transaction.refundSummary ? (
              <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm text-text-secondary">Original-payment linkage</p>
                    <h2 className="font-heading text-xl font-semibold">Refund position</h2>
                  </div>
                  <span className="w-fit rounded-full bg-purple-50 px-3 py-1 text-xs font-semibold capitalize text-purple-700">
                    {transaction.refundSummary.state.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-5 grid gap-4 sm:grid-cols-3">
                  <Metric label="Original payment" value={currency(transaction.amount)} />
                  <Metric label="Refunded" value={currency(transaction.refundSummary.refundedAmount)} />
                  <Metric label="Remaining" value={currency(transaction.refundSummary.remainingRefundable)} />
                </div>
                <div className="mt-6 space-y-3">
                  {transaction.reversals.length ? (
                    transaction.reversals.map((refund) => (
                      <RelatedRow key={refund.id} transaction={refund} />
                    ))
                  ) : (
                    <p className="rounded-xl bg-background p-5 text-center text-sm text-text-secondary">
                      No linked refunds have been posted.
                    </p>
                  )}
                </div>
              </section>
            ) : null}

            {transaction.originalTransaction ? (
              <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6">
                <div className="flex items-center gap-3">
                  <Link2 className="size-5 text-primary" />
                  <h2 className="font-heading text-xl font-semibold">Original payment</h2>
                </div>
                <Link
                  className="mt-5 flex flex-col gap-3 rounded-xl bg-background p-4 sm:flex-row sm:items-center sm:justify-between"
                  to={`/payments/${transaction.originalTransaction.id}`}
                >
                  <div>
                    <p className="font-semibold">{currency(transaction.originalTransaction.amount)}</p>
                    <p className="mt-1 font-mono text-xs text-text-secondary">
                      {transaction.originalTransaction.providerReference ?? transaction.originalTransaction.id}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 text-sm font-semibold text-primary">
                    Inspect payment <ExternalLink className="size-4" />
                  </span>
                </Link>
              </section>
            ) : null}

            {transaction.createdByAdmin || transaction.adminReason ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5 sm:p-6">
                <div className="flex items-center gap-3 text-amber-900">
                  <ShieldCheck className="size-5" />
                  <h2 className="font-heading text-xl font-semibold">Private finance control record</h2>
                </div>
                <dl className="mt-5 grid gap-5 sm:grid-cols-2">
                  <Info label="Acting administrator" value={transaction.createdByAdmin?.name ?? "Not recorded"} />
                  <Info label="Admin role" value={transaction.createdByAdmin?.role.replaceAll("_", " ") ?? "Not recorded"} />
                </dl>
                <div className="mt-5 rounded-xl bg-white/70 p-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-800">Mandatory audit reason</p>
                  <p className="mt-2 text-sm leading-6 text-amber-950">{transaction.adminReason ?? "Not recorded"}</p>
                </div>
              </section>
            ) : null}
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <UserRound className="size-5 text-primary" />
                <h2 className="font-heading text-xl font-semibold">Customer</h2>
              </div>
              <Link className="mt-4 block rounded-xl bg-background p-4" to={`/customers/${transaction.user.id}`}>
                <p className="font-semibold">{transaction.user.name}</p>
                <p className="mt-1 text-sm text-text-secondary">{transaction.user.phone}</p>
                <p className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary">
                  Open customer profile <ArrowRight className="size-3" />
                </p>
              </Link>
              {transaction.customerBalance !== undefined ? (
                <div className="mt-4 rounded-xl bg-forest p-4 text-white">
                  <p className="text-xs text-white/60">Current completed-ledger balance</p>
                  <p className="mt-2 font-heading text-2xl font-semibold">{currency(transaction.customerBalance)}</p>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <FileClock className="size-5 text-primary" />
                <h2 className="font-heading text-xl font-semibold">Control status</h2>
              </div>
              <div className="mt-5 space-y-4 text-sm">
                <ControlCheck text="Fixed precision amount (DECIMAL 14,2)" />
                <ControlCheck text="Immutable customer and actor linkage" />
                <ControlCheck text="Provider reference indexed for exact lookup" />
                {transaction.source.startsWith("admin_") ? (
                  <ControlCheck text="Step-up and idempotency enforced at creation" />
                ) : null}
              </div>
            </section>

            {transaction.type === "PAYMENT" && !refundable ? (
              <section className="rounded-2xl border border-outline/70 bg-white p-5 text-sm leading-6 text-text-secondary shadow-card">
                <div className="flex items-center gap-3 text-text-primary">
                  <CreditCard className="size-5" />
                  <h2 className="font-heading text-lg font-semibold">Refund availability</h2>
                </div>
                <p className="mt-3">
                  {transaction.status !== "completed"
                    ? "Only completed provider payments can be refunded."
                    : !transaction.providerReference
                      ? "This legacy payment has no provider reference."
                      : "The full payment amount has already been refunded."}
                </p>
              </section>
            ) : null}
          </aside>
        </div>
      </div>

      {refundOpen && transaction.refundSummary ? (
        <RefundModal
          csrfToken={csrfToken}
          payment={transaction}
          remaining={transaction.refundSummary.remainingRefundable}
          onClose={() => setRefundOpen(false)}
          onComplete={async (message) => {
            setRefundOpen(false);
            setNotice(message);
            await load();
          }}
        />
      ) : null}
    </main>
  );
}

function RefundModal({
  csrfToken,
  payment,
  remaining,
  onClose,
  onComplete,
}: {
  csrfToken: string | null;
  payment: FinanceTransaction;
  remaining: number;
  onClose: () => void;
  onComplete: (message: string) => Promise<void>;
}) {
  const [amount, setAmount] = useState(remaining.toFixed(2));
  const [reason, setReason] = useState("");
  const [code, setCode] = useState("");
  const [key] = useState(() => window.crypto.randomUUID());
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setWorking(true);
    setError("");
    try {
      await verifyAdminStepUp(csrfToken, code);
      const result = await createAdminRefund(csrfToken, payment.id, {
        amount: Number(amount),
        reason,
        idempotencyKey: key,
      });
      await onComplete(
        `Refund ${currency(result.refundedAmount)} completed and linked. Remaining refundable: ${currency(result.remainingRefundable)}.`,
      );
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Refund failed");
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal onClose={() => !working && onClose()} title="Refund provider payment">
      <form className="space-y-5" onSubmit={submit}>
        {error ? (
          <div className="flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error">
            <AlertCircle className="size-5 shrink-0" /> {error}
          </div>
        ) : null}
        <div className="rounded-xl bg-red-50 p-4 text-sm leading-6 text-red-900">
          This sends a development-provider refund and creates a linked wallet debit. The serializable transaction rejects duplicate, excessive, or balance-unsafe refunds.
        </div>
        <dl className="grid grid-cols-2 gap-3 rounded-xl bg-background p-4 text-sm">
          <Info label="Original payment" value={currency(payment.amount)} />
          <Info label="Remaining refundable" value={currency(remaining)} />
          <div className="col-span-2">
            <Info label="Provider reference" mono value={payment.providerReference ?? "—"} />
          </div>
        </dl>
        <label className="block text-sm font-medium">
          Refund amount (INR)
          <input
            className="mt-2 min-h-12 w-full rounded-xl border border-outline px-3"
            max={remaining}
            min="1"
            onChange={(event) => setAmount(event.target.value)}
            required
            step="0.01"
            type="number"
            value={amount}
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
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-error text-sm font-semibold text-white disabled:opacity-60"
          disabled={working}
          type="submit"
        >
          <RotateCcw className="size-4" />
          {working ? "Verifying and refunding…" : "Confirm linked refund"}
        </button>
      </form>
    </Modal>
  );
}

function RelatedRow({ transaction }: { transaction: RelatedFinanceTransaction }) {
  return (
    <Link
      className="flex flex-col gap-3 rounded-xl border border-outline p-4 transition hover:bg-background sm:flex-row sm:items-center sm:justify-between"
      to={`/payments/${transaction.id}`}
    >
      <div>
        <p className="font-semibold text-error">−{currency(transaction.amount)}</p>
        <p className="mt-1 font-mono text-xs text-text-secondary">
          {transaction.providerReference ?? transaction.id}
        </p>
      </div>
      <div className="text-left sm:text-right">
        <p className="text-xs text-text-secondary">{date(transaction.transactionDate)}</p>
        <p className="mt-1 text-xs font-semibold text-primary">Inspect refund</p>
      </div>
    </Link>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-background p-4">
      <p className="text-xs text-text-secondary">{label}</p>
      <p className="mt-2 font-heading text-xl font-semibold">{value}</p>
    </div>
  );
}

function Info({ label, mono = false, value }: { label: string; mono?: boolean; value: string }) {
  return (
    <div>
      <dt className="text-xs text-text-secondary">{label}</dt>
      <dd className={`mt-1 break-words font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</dd>
    </div>
  );
}

function ControlCheck({ text }: { text: string }) {
  return (
    <div className="flex items-start gap-3">
      <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-primary" />
      <span>{text}</span>
    </div>
  );
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
      <section className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <WalletCards className="size-5 text-primary" />
            <h2 className="font-heading text-2xl font-semibold">{title}</h2>
          </div>
          <button className="grid size-10 place-items-center rounded-full hover:bg-background" onClick={onClose} type="button">
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}
