import {
  BatteryCharging,
  Boxes,
  CheckCircle2,
  CreditCard,
  FileSpreadsheet,
  Headset,
  IndianRupee,
  KeyRound,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AdminApiError,
  getAdminAccessSummary,
  getAdminDashboardMetrics,
  getAdminStepUpAccess,
  ADMIN_API_BASE_URL,
  revokeAdminSessions,
  verifyAdminStepUp,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AdminAccessSummary } from "../../types/admin";
import type { AdminDashboardMetrics } from "../../types/customer";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(value);
}

function formatPortfolioCurrency(value:number){
  return new Intl.NumberFormat("en-IN",{
    style:"currency",
    currency:"INR",
    maximumFractionDigits:0,
  }).format(value);
}

const statusStyles = {
  active: "bg-green-50 text-primary",
  suspended: "bg-amber-50 text-warning",
  closed: "bg-red-50 text-error",
} as const;

export function AdminDashboardPage() {
  const navigate = useNavigate();
  const admin = useAdminStore((state) => state.admin);
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const clearSession = useAdminStore((state) => state.clearSession);
  const [access, setAccess] = useState<AdminAccessSummary | null>(null);
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stepUpCode, setStepUpCode] = useState("");
  const [stepUpMessage, setStepUpMessage] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  const loadDashboard=useCallback(async(silent=false)=>{if(!silent)setLoading(true);setError("");try{const[accessResult,metricResult]=await Promise.all([getAdminAccessSummary(),getAdminDashboardMetrics()]);setAccess(accessResult);setMetrics(metricResult.metrics)}catch(requestError){if(requestError instanceof AdminApiError&&requestError.status===401){clearSession();navigate("/login",{replace:true});return}setError(requestError instanceof Error?requestError.message:"Unable to load the admin dashboard")}finally{if(!silent)setLoading(false)}},[clearSession,navigate]);
  useEffect(()=>{void loadDashboard();const stream=new EventSource(`${ADMIN_API_BASE_URL}/dashboard/events`,{withCredentials:true});stream.addEventListener("change",()=>void loadDashboard(true));const timer=window.setInterval(()=>void loadDashboard(true),30000);return()=>{stream.close();window.clearInterval(timer)}},[loadDashboard]);

  async function stepUp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setActionLoading(true);
    setError("");
    try {
      const result = await verifyAdminStepUp(csrfToken, stepUpCode);
      const accessResult = await getAdminStepUpAccess();
      if (!accessResult.stepUpAuthorized) {
        throw new Error("Step-up authorization was not accepted");
      }
      setStepUpMessage(
        `Step-up verified for ${Math.round(result.validForSeconds / 60)} minutes.`,
      );
      setStepUpCode("");
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to verify step-up code",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function revokeAll() {
    if (!csrfToken) return;
    setActionLoading(true);
    setError("");
    try {
      await revokeAdminSessions(csrfToken);
      clearSession();
      navigate("/login", { replace: true });
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to revoke sessions",
      );
      setActionLoading(false);
    }
  }

  const cards = metrics
    ? [
        {
          label: "Customer accounts",
          value: metrics.customers.total,
          note: `${metrics.customers.active} active · ${metrics.customers.newThisMonth} new this month`,
          icon: Users,
          color: "bg-green-50 text-primary",
        },
        {
          label: "Assets",
          value: metrics.assets.total,
          note: `${metrics.assets.unassigned} unassigned`,
          icon: Boxes,
          color: "bg-blue-50 text-secondary",
        },
        {
          label: "Active subscriptions",
          value: metrics.activeSubscriptions,
          note: "Current platform total",
          icon: UserRoundCheck,
          color: "bg-emerald-50 text-success",
        },
        {
          label: "Open tickets",
          value: metrics.openTickets,
          note: "Open and in progress",
          icon: Headset,
          color: "bg-amber-50 text-warning",
        },
        {
          label: "Payments this month",
          value: formatCurrency(metrics.paymentsThisMonth.amount),
          note: `${metrics.paymentsThisMonth.count} completed credits`,
          icon: CreditCard,
          color: "bg-indigo-50 text-secondary",
        },
      ]
    : [];

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <section className="relative overflow-hidden rounded-3xl bg-forest p-6 text-white shadow-card sm:p-8">
          <div className="absolute -right-20 -top-20 size-64 rounded-full bg-primary/30 blur-3xl" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-green-200">
                Operational overview
              </p>
              <h1 className="mt-3 font-heading text-3xl font-semibold sm:text-4xl">
                Welcome, {admin?.name}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                Live customer, asset, subscription, ticket, and payment summaries. Every customer detail view and mutation is permission checked and audited.
              </p>
            </div>
            <Link
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary-container px-5 text-sm font-semibold text-white hover:bg-primary"
              to="/customers"
            >
              <Users className="size-4" /> Customer directory
            </Link>
          </div>
        </section>

        {error ? (
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-red-50 p-4 text-sm text-error" role="alert">
            <ShieldAlert className="size-5 shrink-0" /> {error}
          </div>
        ) : null}
        {stepUpMessage ? (
          <div className="mt-6 flex items-center gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary" role="status">
            <CheckCircle2 className="size-5 shrink-0" /> {stepUpMessage}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {Array.from({ length: 5 }, (_, index) => (
              <div className="h-36 animate-pulse rounded-2xl bg-white shadow-card" key={index} />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {cards.map(({ label, value, note, icon: Icon, color }) => (
              <article className="min-w-0 overflow-hidden rounded-2xl border border-outline/70 bg-white p-5 shadow-card" key={label}>
                <span className={`grid size-11 place-items-center rounded-xl ${color}`}>
                  <Icon className="size-5" />
                </span>
                <p className="mt-4 text-sm font-medium text-text-secondary">{label}</p>
                <p className="mt-1 break-words font-heading text-2xl font-semibold leading-tight tabular-nums text-text-primary">{value}</p>
                <p className="mt-1 text-xs text-text-secondary">{note}</p>
              </article>
            ))}
          </div>
        )}

        {metrics?.portfolio?<section className="mt-8 rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6"><div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-sm text-text-secondary">Battery finance portfolio</p><h2 className="font-heading text-2xl font-semibold">Live loan and lease position</h2><p className="mt-1 text-xs text-text-secondary">Calculated from normalized case records—not workbook summary cells or payment transactions.</p>{Object.values(metrics.portfolio.comparisons).filter(item=>item.matched===false).length?<p className="mt-2 text-xs font-semibold text-warning">Reconciliation note: {Object.values(metrics.portfolio.comparisons).filter(item=>item.matched===false).length} source-summary variance(s) recorded for review.</p>:<p className="mt-2 text-xs font-semibold text-success">Master Data reconciliation checks passed.</p>}</div><Link className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white" to="/customers?view=portfolio"><FileSpreadsheet className="size-4"/>Open portfolio directory</Link></div><div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[
          {label:"Loan accounts",value:metrics.portfolio.calculated.accounts,note:`${metrics.portfolio.calculated.uniqueCustomerNames} unique names · ${metrics.portfolio.linkedAccounts} linked`,icon:Users},
          {label:"Cases",value:metrics.portfolio.calculated.cases,note:`${metrics.portfolio.calculated.statuses.ACTIVE??0} active`,icon:FileSpreadsheet},
          {label:"Battery assignments",value:metrics.portfolio.calculated.batteryAssignments,note:`${metrics.portfolio.calculated.uniqueBatteries} unique batteries`,icon:BatteryCharging},
          {label:"Delinquent",value:metrics.portfolio.calculated.delinquent,note:`${metrics.portfolio.calculated.npaRepo} NPA/Repo`,icon:ShieldAlert},
          {label:"DP collected",value:formatPortfolioCurrency(metrics.portfolio.calculated.dpAmount),note:"Portfolio field—not payment ledger",icon:IndianRupee},
          {label:"Billed to date",value:formatPortfolioCurrency(metrics.portfolio.calculated.billedToDate),note:"Imported finance position",icon:CreditCard},
          {label:"Future demand",value:formatPortfolioCurrency(metrics.portfolio.calculated.futureDemand),note:`Contracted ${formatPortfolioCurrency(metrics.portfolio.calculated.contractedDemand)}`,icon:IndianRupee},
        ].map(({label,value,note,icon:Icon})=><article className="min-w-0 overflow-hidden rounded-xl border border-outline/70 bg-background p-5" key={label}><div className="flex items-start justify-between gap-3"><Icon className="size-5 shrink-0 text-primary"/><span className="rounded-full bg-white px-2 py-1 text-[9px] font-semibold uppercase tracking-wide text-text-secondary">Live</span></div><p className="mt-4 text-xs font-medium text-text-secondary">{label}</p><p className="mt-1 break-words font-heading text-[clamp(1.15rem,1.8vw,1.5rem)] font-semibold leading-tight tabular-nums text-text-primary" title={String(value)}>{value}</p><p className="mt-2 min-h-8 text-[11px] leading-4 text-text-secondary">{note}</p></article>)}</div><div className="mt-6 grid gap-4 border-t border-outline pt-5 md:grid-cols-2 xl:grid-cols-4"><MiniDistribution title="Case status" items={Object.entries(metrics.portfolio.calculated.statuses).map(([label,value])=>({label,value}))}/><MiniDistribution title="Collections bucket" items={Object.entries(metrics.portfolio.calculated.buckets).map(([label,value])=>({label,value}))}/><MiniDistribution title="Deployment state" items={Object.entries(metrics.portfolio.calculated.states).map(([label,value])=>({label,value}))}/><MiniDistribution title="Top dealers" items={metrics.portfolio.calculated.dealerStats.slice(0,5).map(item=>({label:item.name,value:item.cases}))}/></div></section>:null}

        <div className="mt-8 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card sm:p-6">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm text-text-secondary">Newest accounts</p>
                <h2 className="font-heading text-2xl font-semibold text-text-primary">Recent customers</h2>
              </div>
              <Link className="text-sm font-semibold text-primary hover:underline" to="/customers">
                View all
              </Link>
            </div>
            <div className="mt-5 divide-y divide-outline/60">
              {metrics?.recentCustomers.length ? (
                metrics.recentCustomers.map((customer) => (
                  <Link
                    className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
                    key={customer.id}
                    to={`/customers/${customer.id}`}
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-text-primary">{customer.name}</p>
                      <p className="mt-1 text-xs text-text-secondary">{customer.phone} · {customer._count.assets} assets</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[customer.accountStatus]}`}>
                      {customer.accountStatus}
                    </span>
                  </Link>
                ))
              ) : (
                <p className="py-10 text-center text-sm text-text-secondary">No customers yet.</p>
              )}
            </div>
            {metrics?.portfolio.recentAccounts.length?<div className="mt-6 border-t border-outline pt-5"><div className="flex items-center justify-between"><div><p className="text-xs text-text-secondary">Latest disbursed agreements</p><h3 className="font-heading text-lg font-semibold">Recent portfolio customers</h3></div><Link className="text-xs font-semibold text-primary" to="/customers?view=portfolio">View portfolio</Link></div><div className="mt-3 divide-y divide-outline/60">{metrics.portfolio.recentAccounts.map(account=>{const item=account.cases[0];return <Link className="flex items-center justify-between gap-4 py-3" key={account.id} to={`/customers/portfolio/${account.id}`}><div className="min-w-0"><p className="truncate font-semibold">{account.customerName}</p><p className="mt-1 truncate font-mono text-xs text-text-secondary">{account.customerLoanId} · {item?.dealer.name??"No dealer"}</p></div><div className="text-right"><span className="rounded-full bg-brand-soft px-2 py-1 text-[10px] font-semibold text-primary">{account.portfolioStatus}</span><p className="mt-1 text-[10px] text-text-secondary">{item?.deploymentState}</p></div></Link>})}</div></div>:null}
          </section>

          <aside className="space-y-5">
            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-xl bg-green-50 text-primary">
                  <KeyRound className="size-5" />
                </span>
                <div>
                  <h2 className="font-semibold text-text-primary">Admin step-up</h2>
                  <p className="text-xs text-text-secondary">Required for customer status changes</p>
                </div>
              </div>
              <form className="mt-5" onSubmit={stepUp}>
                <label className="text-sm font-medium text-text-primary">
                  Authenticator code
                  <input
                    className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 text-center font-mono text-lg font-semibold tracking-[0.2em] outline-none focus:border-primary focus:ring-4 focus:ring-green-100"
                    inputMode="numeric"
                    maxLength={6}
                    onChange={(event) => setStepUpCode(event.target.value.replace(/\D/g, ""))}
                    required
                    value={stepUpCode}
                  />
                </label>
                <button
                  className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-container disabled:opacity-60"
                  disabled={actionLoading}
                  type="submit"
                >
                  <ShieldCheck className="size-4" /> Verify step-up
                </button>
              </form>
            </section>

            <section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card">
              <h2 className="font-semibold text-text-primary">Session security</h2>
              <p className="mt-2 text-sm leading-6 text-text-secondary">
                Revoke every active admin session if a device or credential may be compromised.
              </p>
              <button
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-error/30 px-4 text-sm font-semibold text-error hover:bg-red-50 disabled:opacity-60"
                disabled={actionLoading}
                onClick={() => void revokeAll()}
                type="button"
              >

                Revoke all sessions
              </button>
            </section>
          </aside>
        </div>

        {access ? (
          <p className="mt-8 text-center text-xs text-text-secondary">
            Enabled modules: {access.enabledModules?.join(", ") ?? "dashboard, customers"}
          </p>
        ) : null}
      </div>
    </main>
  );
}

function MiniDistribution({title,items}:{title:string;items:Array<{label:string;value:number}>}){const maximum=Math.max(1,...items.map(item=>item.value));return <article><h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h3><div className="mt-3 space-y-2">{items.slice(0,6).map(item=><div key={item.label}><div className="flex justify-between gap-2 text-xs"><span className="truncate">{item.label}</span><strong>{item.value}</strong></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-background"><div className="h-full rounded-full bg-primary" style={{width:`${Math.max(2,item.value/maximum*100)}%`}}/></div></div>)}</div></article>}
