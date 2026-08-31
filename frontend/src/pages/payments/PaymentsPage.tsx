import {
  AlertCircle,
  ArrowRight,
  Check,
  CreditCard,
  Landmark,
  LockKeyhole,
  QrCode,
  ReceiptText,
  RotateCcw,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { BrandLogo } from "../../components/BrandLogo";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import {
  ApiClientError,
  createPayment,
  getLedgerSummary,
  getPayment,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type {
  LedgerSummary,
  Payment,
  PaymentMethod,
} from "../../types/api";

type PaymentStep = "select" | "processing" | "success" | "error";

interface MethodOption {
  method: PaymentMethod;
  label: string;
  description: string;
  icon: LucideIcon;
  iconClass: string;
  badge?: string;
}

const paymentMethods: MethodOption[] = [
  {
    method: "UPI",
    label: "UPI",
    description: "GPay, PhonePe, Paytm and other UPI apps",
    icon: QrCode,
    iconClass: "bg-primary/10 text-primary",
    badge: "Popular",
  },
  {
    method: "CARD",
    label: "Debit or Credit Card",
    description: "Visa, Mastercard and RuPay",
    icon: CreditCard,
    iconClass: "bg-secondary/10 text-secondary",
  },
  {
    method: "NET_BANKING",
    label: "Net Banking",
    description: "Use your bank's online payment service",
    icon: Landmark,
    iconClass: "bg-surface-container text-on-surface-variant",
  },
];

const quickAmounts = [500, 1000, 2000, 5000];

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

function methodLabel(method: PaymentMethod) {
  if (method === "NET_BANKING") return "Net Banking";
  if (method === "CARD") return "Card";
  return "UPI";
}

export function PaymentsPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [summary, setSummary] = useState<LedgerSummary | null>(null);
  const [amountInput, setAmountInput] = useState("500");
  const [method, setMethod] = useState<PaymentMethod>("UPI");
  const [step, setStep] = useState<PaymentStep>("select");
  const [payment, setPayment] = useState<Payment | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [error, setError] = useState("");

  const amount = Number(amountInput);
  const amountIsValid =
    Number.isFinite(amount) && amount >= 1 && amount <= 100000;

  useEffect(() => {
    if (!token) return;

    let active = true;
    void getLedgerSummary(token)
      .then((result) => {
        if (active) setSummary(result.summary);
      })
      .catch((requestError: unknown) => {
        if (
          active &&
          requestError instanceof ApiClientError &&
          requestError.status === 401
        ) {
          logout();
          navigate("/login", { replace: true });
        }
      })
      .finally(() => {
        if (active) setLoadingSummary(false);
      });

    return () => {
      active = false;
    };
  }, [logout, navigate, token]);

  async function handlePayment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token || !amountIsValid) {
      setError("Enter an amount between ₹1 and ₹1,00,000.");
      return;
    }

    setStep("processing");
    try {
      const [created] = await Promise.all([
        createPayment(token, { amount, method }),
        new Promise((resolve) => window.setTimeout(resolve, 700)),
      ]);
      const persisted = await getPayment(token, created.transactionId);
      setPayment(persisted.payment);
      setStep("success");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "The payment could not be completed.",
      );
      setStep("error");
    }
  }

  if (step === "processing") {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-white px-5 py-10 text-center">
        <div className="absolute left-1/2 top-6 -translate-x-1/2">
          <BrandLogo variant="auth" />
        </div>
        <section className="w-full max-w-md">
          <div className="relative mx-auto grid size-24 place-items-center">
            <div className="absolute inset-0 animate-spin rounded-full border-4 border-success/15 border-t-success" />
            <div className="size-14 animate-ping rounded-full bg-success/10" />
          </div>
          <h1 className="mt-8 font-heading text-3xl font-semibold text-text-primary">
            Processing your payment…
          </h1>
          <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-text-secondary">
            Please keep this screen open while the transaction is completed.
          </p>
          <div className="mt-10 inline-flex items-center gap-2 text-sm font-medium text-primary/75">
            <LockKeyhole aria-hidden="true" className="size-4" />
            Secure transaction
          </div>
        </section>
      </main>
    );
  }

  if (step === "success" && payment) {
    return (
      <main className="relative grid min-h-screen place-items-center overflow-hidden bg-background px-4 py-10 sm:px-6">
        <div className="pointer-events-none absolute -left-28 -top-28 size-80 rounded-full bg-success/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-28 -right-28 size-80 rounded-full bg-lime/20 blur-3xl" />
        <Card className="relative z-10 flex w-full max-w-md flex-col items-center p-6 text-center sm:p-8">
          <BrandLogo variant="auth" />
          <div className="success-check-burst mt-7 grid size-24 place-items-center rounded-full bg-gradient-to-br from-success to-lime text-white shadow-[0_8px_30px_rgba(22,163,74,.3)]">
            <Check
              aria-hidden="true"
              className="success-checkmark size-12"
              strokeWidth={3}
            />
          </div>
          <h1 className="mt-6 font-heading text-3xl font-semibold text-text-primary">
            Payment Successful!
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">
            Your BatFIN wallet has been recharged with{" "}
            <strong className="text-text-primary">{formatCurrency(payment.amount)}</strong>.
          </p>

          <div className="mt-7 w-full rounded-2xl border border-surface-container-high bg-surface-container-low p-4 text-left">
            <p className="border-b border-surface-container-high pb-3 text-xs font-semibold uppercase tracking-wider text-text-secondary">
              Transaction Details
            </p>
            <dl className="mt-4 space-y-4 text-sm">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-text-secondary">Transaction ID</dt>
                <dd className="max-w-[62%] break-all text-right font-semibold tabular-nums text-text-primary">
                  {payment.transactionId}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-text-secondary">Date & Time</dt>
                <dd className="text-right font-medium text-text-primary">
                  {new Intl.DateTimeFormat("en-IN", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: "Asia/Kolkata",
                  }).format(new Date(payment.transactionDate))}
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-text-secondary">Payment Method</dt>
                <dd className="font-medium text-text-primary">{methodLabel(payment.method)}</dd>
              </div>
              {payment.providerReference ? (
                <div className="flex items-start justify-between gap-4">
                  <dt className="text-text-secondary">Reference</dt>
                  <dd className="max-w-[62%] break-all text-right font-medium tabular-nums text-text-primary">
                    {payment.providerReference}
                  </dd>
                </div>
              ) : null}
            </dl>
          </div>

          <div className="mt-7 grid w-full gap-3 sm:grid-cols-2">
            <Button fullWidth onClick={() => navigate("/dashboard")}>
              Back to Home
            </Button>
            <Button fullWidth onClick={() => navigate("/ledger")} variant="secondary">
              <ReceiptText aria-hidden="true" className="size-4" />
              View Ledger
            </Button>
          </div>
        </Card>
      </main>
    );
  }

  if (step === "error") {
    return (
      <main className="grid min-h-screen place-items-center bg-background px-4 py-10">
        <Card className="w-full max-w-md p-7 text-center">
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-error-container text-error">
            <AlertCircle aria-hidden="true" className="size-8" />
          </div>
          <h1 className="mt-5 font-heading text-2xl font-semibold text-text-primary">
            Payment unsuccessful
          </h1>
          <p className="mt-2 text-sm leading-6 text-text-secondary">{error}</p>
          <Button
            className="mt-6"
            onClick={() => {
              setStep("select");
              setError("");
            }}
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            Try again
          </Button>
        </Card>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28 md:pb-10">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate("/ledger")}
        title="BatFIN"
      />
      <form onSubmit={handlePayment}>
        <main className="page-enter mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 md:px-8 md:py-10">
          <div className="mb-7">
            <p className="text-sm font-medium text-text-secondary">Secure wallet recharge</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary sm:text-4xl">
              Select Payment Method
            </h1>
          </div>

          <Card className="relative overflow-hidden p-6 text-center sm:p-8">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-success/10 to-lime/10" />
            <div className="relative">
              <p className="text-sm text-text-secondary">Amount to Pay</p>
              <label className="mx-auto mt-3 flex max-w-sm items-center justify-center" htmlFor="payment-amount">
                <span className="text-3xl font-semibold text-primary">₹</span>
                <input
                  aria-describedby="amount-help"
                  className="min-w-[2ch] max-w-[70vw] appearance-none bg-transparent px-2 text-center font-heading text-4xl font-semibold tabular-nums text-primary outline-none placeholder:text-outline/50 sm:text-5xl"
                  id="payment-amount"
                  inputMode="decimal"
                  max="100000"
                  min="1"
                  onChange={(event) =>
                    setAmountInput(event.target.value.replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                  required
                  step="0.01"
                  style={{
                    width: `${Math.max(2, Math.min(8, amountInput.length || 1))}ch`,
                  }}
                  type="number"
                  value={amountInput}
                />
              </label>
              <p className="mt-2 text-xs text-text-secondary" id="amount-help">
                Enter between ₹1 and ₹1,00,000
              </p>
              <div className="hide-scrollbar mt-5 flex gap-2 overflow-x-auto pb-1 sm:justify-center">
                {quickAmounts.map((quickAmount) => (
                  <button
                    className={`min-h-10 shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                      amount === quickAmount
                        ? "border-primary bg-primary text-white"
                        : "border-outline-variant bg-white text-on-surface-variant hover:border-primary"
                    }`}
                    key={quickAmount}
                    onClick={() => setAmountInput(String(quickAmount))}
                    type="button"
                  >
                    {formatCurrency(quickAmount)}
                  </button>
                ))}
              </div>
              <div className="mt-5 inline-flex items-center gap-2 text-xs text-text-secondary">
                <WalletBalance loading={loadingSummary} summary={summary} />
              </div>
            </div>
          </Card>

          <h2 className="mb-4 mt-7 font-heading text-xl font-semibold text-text-primary sm:text-2xl">
            Payment Method
          </h2>
          <fieldset className="space-y-4">
            <legend className="sr-only">Choose payment method</legend>
            {paymentMethods.map((option) => {
              const Icon = option.icon;
              const selected = method === option.method;
              return (
                <button
                  aria-pressed={selected}
                  className={`flex min-h-20 w-full items-center justify-between gap-4 rounded-card border-[1.5px] bg-white p-4 text-left shadow-card transition active:scale-[0.99] sm:p-5 ${
                    selected
                      ? "border-primary bg-success/5"
                      : "border-surface-container-high hover:border-outline-variant"
                  }`}
                  key={option.method}
                  onClick={() => setMethod(option.method)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-3 sm:gap-4">
                    <span className={`grid size-12 shrink-0 place-items-center rounded-xl ${option.iconClass}`}>
                      <Icon aria-hidden="true" className="size-6" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-text-primary">{option.label}</span>
                        {option.badge ? (
                          <span className="rounded-full bg-tertiary-fixed px-2 py-0.5 text-[10px] font-semibold text-on-primary-fixed">
                            {option.badge}
                          </span>
                        ) : null}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-text-secondary sm:text-sm">
                        {option.description}
                      </span>
                    </span>
                  </span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${
                      selected ? "border-primary" : "border-outline-variant"
                    }`}
                  >
                    <span
                      className={`size-3 rounded-full bg-primary transition ${selected ? "scale-100" : "scale-0"}`}
                    />
                  </span>
                </button>
              );
            })}
          </fieldset>

          {error ? (
            <p className="mt-5 rounded-xl bg-error-container p-3 text-sm text-on-error-container" role="alert">
              {error}
            </p>
          ) : null}

          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-text-secondary">
            <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
            Payment details are processed securely
          </div>
        </main>

        <div className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-surface-container-high bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,.06)] backdrop-blur md:static md:mx-auto md:mb-8 md:max-w-4xl md:border-0 md:bg-transparent md:px-8 md:shadow-none">
          <Button className="min-h-14 text-base" disabled={!amountIsValid} fullWidth type="submit">
            Pay Now · {amountIsValid ? formatCurrency(amount) : "Enter amount"}
            <ArrowRight aria-hidden="true" className="size-4" />
          </Button>
        </div>
      </form>
    </div>
  );
}

function WalletBalance({
  loading,
  summary,
}: {
  loading: boolean;
  summary: LedgerSummary | null;
}) {
  if (loading) return <LoadingSkeleton className="h-4 w-36" />;

  if (!summary) {
    return <span className="text-warning">Wallet balance is temporarily unavailable</span>;
  }

  return (
    <>
      <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
      Current wallet balance: {formatCurrency(summary.currentBalance)}
    </>
  );
}
