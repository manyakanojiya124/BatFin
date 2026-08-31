import {
  AlertCircle,
  ArrowLeft,
  BatteryCharging,
  CheckCircle2,
  CreditCard,
  Edit3,
  FileText,
  Mail,
  MapPin,
  Phone,
  RefreshCw,
  Save,
  ShieldAlert,
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
import { Link, useNavigate, useParams } from "react-router-dom";

import {
  AdminApiError,
  getAdminAccessSummary,
  getAdminCustomer,
  updateAdminCustomerProfile,
  updateAdminCustomerStatus,
  verifyAdminStepUp,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AdminAccessSummary } from "../../types/admin";
import type {
  CustomerDetail,
  CustomerStatus,
} from "../../types/customer";

const statusStyles: Record<CustomerStatus, string> = {
  active: "bg-green-50 text-primary",
  suspended: "bg-amber-50 text-warning",
  closed: "bg-red-50 text-error",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function AdminCustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const clearSession = useAdminStore((state) => state.clearSession);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [access, setAccess] = useState<AdminAccessSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [editReason, setEditReason] = useState("");
  const [statusTarget, setStatusTarget] = useState<CustomerStatus | null>(null);
  const [statusReason, setStatusReason] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  const loadCustomer = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError("");
    try {
      const [customerResult, accessResult] = await Promise.all([
        getAdminCustomer(id),
        getAdminAccessSummary(),
      ]);
      setCustomer(customerResult.customer);
      setAccess(accessResult);
      setName(customerResult.customer.name);
      setEmail(customerResult.customer.email ?? "");
      setAddress(customerResult.customer.address ?? "");
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load customer",
      );
    } finally {
      setLoading(false);
    }
  }, [clearSession, id, navigate]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !id) return;
    setActionLoading(true);
    setActionError("");
    try {
      await updateAdminCustomerProfile(csrfToken, id, {
        name,
        email: email.trim() || null,
        address: address.trim() || null,
        reason: editReason,
      });
      setEditing(false);
      setEditReason("");
      setNotice("Customer profile was updated and audited.");
      await loadCustomer();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update customer",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function changeStatus(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken || !id || !statusTarget) return;
    setActionLoading(true);
    setActionError("");
    try {
      await verifyAdminStepUp(csrfToken, stepUpCode);
      await updateAdminCustomerStatus(
        csrfToken,
        id,
        statusTarget,
        statusReason,
      );
      setStatusTarget(null);
      setStatusReason("");
      setStepUpCode("");
      setNotice(`Customer account changed to ${statusTarget}.`);
      await loadCustomer();
    } catch (requestError) {
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to change customer status",
      );
    } finally {
      setActionLoading(false);
    }
  }

  const canUpdate = access?.permissions.includes("customers.update") ?? false;

  if (loading && !customer) {
    return (
      <main className="grid min-h-[70vh] place-items-center">
        <div className="size-12 animate-spin rounded-full border-4 border-green-100 border-t-primary" />
      </main>
    );
  }

  if (error || !customer) {
    return (
      <main className="grid min-h-[70vh] place-items-center p-6 text-center">
        <div>
          <AlertCircle className="mx-auto size-10 text-error" />
          <h1 className="mt-4 font-heading text-2xl font-semibold">Unable to load customer</h1>
          <p className="mt-2 text-sm text-text-secondary">{error}</p>
          <button className="mt-5 inline-flex items-center gap-2 font-semibold text-primary" onClick={() => void loadCustomer()} type="button">
            <RefreshCw className="size-4" /> Retry
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline" to="/customers">
          <ArrowLeft className="size-4" /> Customer directory
        </Link>

        <section className="mt-5 flex flex-col gap-5 rounded-3xl bg-white p-6 shadow-card lg:flex-row lg:items-center lg:justify-between lg:p-8">
          <div className="flex min-w-0 items-center gap-4">
            <span className="grid size-16 shrink-0 place-items-center rounded-2xl bg-green-50 font-heading text-xl font-semibold text-primary">
              {customer.name
                .split(" ")
                .slice(0, 2)
                .map((part) => part[0])
                .join("")
                .toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="truncate font-heading text-3xl font-semibold text-text-primary">{customer.name}</h1>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[customer.accountStatus]}`}>
                  {customer.accountStatus}
                </span>
              </div>
              <p className="mt-2 font-mono text-sm text-text-secondary">{customer.phone}</p>
              <p className="mt-1 text-xs text-text-secondary">Customer since {formatDate(customer.createdAt)}</p>
            </div>
          </div>

          {canUpdate ? (
            <div className="flex flex-wrap gap-2">
              <button
                className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline px-4 text-sm font-semibold text-text-primary hover:bg-background"
                onClick={() => {
                  setEditing(true);
                  setActionError("");
                }}
                type="button"
              >
                <Edit3 className="size-4" /> Edit profile
              </button>
              {customer.accountStatus !== "active" ? (
                <StatusButton label="Reactivate" onClick={() => setStatusTarget("active")} tone="success" />
              ) : (
                <StatusButton label="Suspend" onClick={() => setStatusTarget("suspended")} tone="warning" />
              )}
              {customer.accountStatus !== "closed" ? (
                <StatusButton label="Close account" onClick={() => setStatusTarget("closed")} tone="danger" />
              ) : null}
            </div>
          ) : null}
        </section>

        {notice ? (
          <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary" role="status">
            <CheckCircle2 className="size-5" /> {notice}
          </div>
        ) : null}

        <section className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard icon={CreditCard} label="Wallet balance" value={formatCurrency(customer.financialSummary.currentBalance)} />
          <SummaryCard icon={BatteryCharging} label="Assets" value={String(customer._count.assets)} />
          <SummaryCard icon={FileText} label="Transactions" value={String(customer._count.transactions)} />
          <SummaryCard icon={ShieldAlert} label="Tickets" value={String(customer._count.tickets)} />
        </section>

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_minmax(340px,0.6fr)]">
          <div className="space-y-6">
            {customer.portfolioAccounts.length?<section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6"><div className="flex items-center justify-between"><div><p className="text-xs text-text-secondary">Battery finance</p><h2 className="font-heading text-xl font-semibold">Linked portfolio agreements</h2></div><span className="rounded-full bg-brand-soft px-3 py-1 text-xs font-semibold text-primary">{customer.portfolioAccounts.length}</span></div><div className="mt-4 space-y-3">{customer.portfolioAccounts.map(account=><Link className="block rounded-xl bg-background p-4 hover:bg-brand-soft/40" key={account.id} to={`/customers/portfolio/${account.id}`}><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{account.customerLoanId}</p><p className="mt-1 text-xs text-text-secondary">{account.caseCount} case{account.caseCount===1?"":"s"} · {account.portfolioStatus}</p></div><p className="font-semibold text-primary">{formatCurrency(account.financial.futureDemand)} future</p></div></Link>)}</div></section>:null}
            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-heading text-xl font-semibold text-text-primary">Assets</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {customer.assets.length ? customer.assets.map((asset) => (
                  <article className="rounded-2xl bg-background p-4" key={asset.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-text-primary">{asset.productType}</p>
                        <p className="mt-1 font-mono text-xs text-text-secondary">{asset.serialNumber}</p>
                      </div>
                      <span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold capitalize text-primary">{asset.status}</span>
                    </div>
                    <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-text-secondary">
                      <span>Charge: {asset.batteryLevel ?? "—"}%</span>
                      <span>Temp: {asset.temperature ?? "—"}°C</span>
                      <span className="col-span-2">Inventory: {asset.inventoryStatus}</span>
                    </div>
                  </article>
                )) : <Empty text="No assets assigned." />}
              </div>
            </section>

            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6">
              <h2 className="font-heading text-xl font-semibold text-text-primary">Recent transactions</h2>
              <div className="mt-4 divide-y divide-outline/60">
                {customer.transactions.length ? customer.transactions.slice(0, 10).map((transaction) => (
                  <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0" key={transaction.id}>
                    <div className="min-w-0">
                      <p className="font-semibold text-text-primary">{transaction.type.replaceAll("_", " ")}</p>
                      <p className="mt-1 truncate text-xs text-text-secondary">{transaction.description || formatDate(transaction.transactionDate)}</p>
                    </div>
                    <p className={`shrink-0 font-semibold ${transaction.direction === "CREDIT" ? "text-primary" : "text-error"}`}>
                      {transaction.direction === "CREDIT" ? "+" : "−"}{formatCurrency(transaction.amount)}
                    </p>
                  </div>
                )) : <Empty text="No transactions." />}
              </div>
            </section>
          </div>

          <aside className="space-y-6">
            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <h2 className="font-heading text-xl font-semibold text-text-primary">Contact profile</h2>
              <dl className="mt-5 space-y-4 text-sm">
                <DetailRow icon={Phone} label="Phone" value={customer.phone} />
                <DetailRow icon={Mail} label="Email" value={customer.email || "Not provided"} />
                <DetailRow icon={MapPin} label="Address" value={customer.address || "Not provided"} />
              </dl>
            </section>

            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <h2 className="font-heading text-xl font-semibold text-text-primary">Subscriptions</h2>
              <div className="mt-4 space-y-3">
                {customer.subscriptions.length ? customer.subscriptions.map((subscription) => (
                  <article className="rounded-xl bg-background p-3" key={subscription.id}>
                    <p className="font-semibold text-text-primary">{subscription.plan.name}</p>
                    <p className="mt-1 text-xs text-text-secondary">{subscription.asset.productType} · {subscription.status}</p>
                  </article>
                )) : <Empty text="No subscriptions." />}
              </div>
            </section>

            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <h2 className="font-heading text-xl font-semibold text-text-primary">Latest tickets</h2>
              <div className="mt-4 space-y-3">
                {customer.tickets.length ? customer.tickets.map((ticket) => (
                  <article className="rounded-xl bg-background p-3" key={ticket.id}>
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-text-primary">{ticket.type.replaceAll("_", " ")}</p>
                      <span className="text-[10px] font-semibold capitalize text-text-secondary">{ticket.status.replaceAll("_", " ")}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-text-secondary">{ticket.description}</p>
                  </article>
                )) : <Empty text="No support tickets." />}
              </div>
            </section>
          </aside>
        </div>
      </div>

      {editing ? (
        <Modal title="Edit customer profile" onClose={() => !actionLoading && setEditing(false)}>
          <form className="space-y-4" onSubmit={saveProfile}>
            {actionError ? <ErrorAlert text={actionError} /> : null}
            <TextInput label="Name" onChange={setName} value={name} />
            <TextInput label="Email" onChange={setEmail} type="email" value={email} />
            <TextArea label="Address" onChange={setAddress} value={address} />
            <TextArea label="Audit reason" onChange={setEditReason} required value={editReason} />
            <ModalActions loading={actionLoading} onCancel={() => setEditing(false)} submitLabel="Save audited change" />
          </form>
        </Modal>
      ) : null}

      {statusTarget ? (
        <Modal title={`${statusTarget === "active" ? "Reactivate" : statusTarget === "closed" ? "Close" : "Suspend"} customer`} onClose={() => !actionLoading && setStatusTarget(null)}>
          <form className="space-y-4" onSubmit={changeStatus}>
            {actionError ? <ErrorAlert text={actionError} /> : null}
            <div className="rounded-xl bg-amber-50 p-4 text-sm leading-6 text-amber-900">
              This change immediately affects customer authentication and API access. A fresh authenticator code and an audit reason are mandatory.
            </div>
            <TextArea label="Audit reason" onChange={setStatusReason} required value={statusReason} />
            <TextInput label="Authenticator code" maxLength={6} onChange={(value) => setStepUpCode(value.replace(/\D/g, ""))} value={stepUpCode} />
            <ModalActions loading={actionLoading} onCancel={() => setStatusTarget(null)} submitLabel={`Confirm ${statusTarget}`} />
          </form>
        </Modal>
      ) : null}
    </main>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
      <Icon className="size-5 text-primary" />
      <p className="mt-4 text-sm text-text-secondary">{label}</p>
      <p className="mt-1 font-heading text-2xl font-semibold text-text-primary">{value}</p>
    </article>
  );
}

function DetailRow({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <div>
        <dt className="text-xs text-text-secondary">{label}</dt>
        <dd className="mt-1 break-words font-medium text-text-primary">{value}</dd>
      </div>
    </div>
  );
}

function StatusButton({ label, onClick, tone }: { label: string; onClick: () => void; tone: "success" | "warning" | "danger" }) {
  const styles = {
    success: "border-green-200 text-primary hover:bg-green-50",
    warning: "border-amber-200 text-warning hover:bg-amber-50",
    danger: "border-red-200 text-error hover:bg-red-50",
  };
  return <button className={`min-h-11 rounded-xl border px-4 text-sm font-semibold ${styles[tone]}`} onClick={onClick} type="button">{label}</button>;
}

function Modal({ children, onClose, title }: { children: ReactNode; onClose: () => void; title: string }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-heading text-xl font-semibold text-text-primary">{title}</h2>
          <button className="grid size-10 place-items-center rounded-full hover:bg-background" onClick={onClose} type="button"><X className="size-5" /></button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

function TextInput({ label, maxLength, onChange, type = "text", value }: { label: string; maxLength?: number; onChange: (value: string) => void; type?: string; value: string }) {
  return <label className="block text-sm font-medium text-text-primary">{label}<input className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 outline-none focus:border-primary focus:ring-4 focus:ring-green-100" maxLength={maxLength} onChange={(event) => onChange(event.target.value)} required type={type} value={value} /></label>;
}

function TextArea({ label, onChange, required = false, value }: { label: string; onChange: (value: string) => void; required?: boolean; value: string }) {
  return <label className="block text-sm font-medium text-text-primary">{label}<textarea className="mt-2 min-h-24 w-full resize-y rounded-xl border border-outline p-3 outline-none focus:border-primary focus:ring-4 focus:ring-green-100" onChange={(event) => onChange(event.target.value)} required={required} value={value} /></label>;
}

function ModalActions({ loading, onCancel, submitLabel }: { loading: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="flex flex-col-reverse gap-3 border-t border-outline/70 pt-4 sm:flex-row sm:justify-end"><button className="min-h-11 rounded-xl px-4 text-sm font-semibold text-text-secondary" disabled={loading} onClick={onCancel} type="button">Cancel</button><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit">{loading ? <RefreshCw className="size-4 animate-spin" /> : <Save className="size-4" />}{submitLabel}</button></div>;
}

function ErrorAlert({ text }: { text: string }) {
  return <div className="flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error"><AlertCircle className="size-5 shrink-0" />{text}</div>;
}

function Empty({ text }: { text: string }) {
  return <p className="py-5 text-center text-sm text-text-secondary">{text}</p>;
}
