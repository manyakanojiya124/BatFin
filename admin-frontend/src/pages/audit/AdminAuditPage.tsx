import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileClock,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import {
  AdminApiError,
  downloadAdminAuditExport,
  getAdminAuditFacets,
  getAdminAuditSummary,
  listAdminAudit,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { CustomerPagination } from "../../types/customer";
import type {
  AdminAuditEntry,
  AdminAuditFacets,
  AdminAuditSummary,
} from "../../types/governance";

function date(value: string) {
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function title(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function AdminAuditPage() {
  const navigate = useNavigate();
  const clearSession = useAdminStore((state) => state.clearSession);
  const [entries, setEntries] = useState<AdminAuditEntry[]>([]);
  const [summary, setSummary] = useState<AdminAuditSummary | null>(null);
  const [facets, setFacets] = useState<AdminAuditFacets | null>(null);
  const [pagination, setPagination] = useState<CustomerPagination>({
    page: 1,
    pageSize: 25,
    total: 0,
    totalPages: 1,
  });
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [adminUserId, setAdminUserId] = useState("");
  const [success, setSuccess] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [list, stats, options] = await Promise.all([
        listAdminAudit({
          q: query,
          action,
          resourceType,
          adminUserId,
          success: success as "true" | "false" | "",
          dateFrom,
          dateTo,
          page,
          pageSize: 25,
        }),
        getAdminAuditSummary(),
        getAdminAuditFacets(),
      ]);
      setEntries(list.entries);
      setPagination(list.pagination);
      setSummary(stats.summary);
      setFacets(options);
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError instanceof Error ? requestError.message : "Unable to load audit records");
    } finally {
      setLoading(false);
    }
  }, [action, adminUserId, clearSession, dateFrom, dateTo, navigate, page, query, resourceType, success]);

  useEffect(() => {
    void load();
  }, [load]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  async function exportCsv() {
    setExporting(true);
    setError("");
    try {
      const result = await downloadAdminAuditExport({
        q: query,
        action,
        resourceType,
        adminUserId,
        success: success as "true" | "false" | "",
        dateFrom,
        dateTo,
      });
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.fileName;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setNotice("Filtered audit export downloaded and recorded in the audit trail.");
      window.setTimeout(() => setNotice(""), 5000);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Audit export failed");
    } finally {
      setExporting(false);
    }
  }

  const cards = summary
    ? [
        ["All-time events", summary.total, FileClock, "bg-blue-50 text-secondary"],
        ["Last 24 hours", summary.last24Hours, Activity, "bg-green-50 text-primary"],
        ["Rejected in 24h", summary.rejectedLast24Hours, AlertTriangle, "bg-red-50 text-error"],
        ["Active admins / 30d", summary.activeAdminsLast30Days, Users, "bg-purple-50 text-purple-700"],
      ] as const
    : [];

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm text-text-secondary">Append-only governance record</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold">Audit explorer</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              Search successful and rejected privileged actions. Metadata is recursively sanitized before display and export.
            </p>
          </div>
          <button className="action-btn" disabled={exporting} onClick={() => void exportCsv()} type="button">
            <Download className="size-4" /> {exporting ? "Exporting…" : "Export CSV"}
          </button>
        </div>

        <section className="mt-7 grid grid-cols-2 gap-4 xl:grid-cols-4">
          {cards.map(([label, value, Icon, tone]) => (
            <article className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card" key={label}>
              <span className={`grid size-11 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span>
              <p className="mt-4 text-sm text-text-secondary">{label}</p>
              <p className="mt-1 font-heading text-2xl font-semibold">{value}</p>
            </article>
          ))}
        </section>

        {notice ? <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary" role="status"><CheckCircle2 className="size-5" />{notice}</div> : null}
        {error ? <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-red-50 p-4 text-sm text-error" role="alert"><span className="flex gap-3"><AlertTriangle className="size-5 shrink-0" />{error}</span><button aria-label="Retry" onClick={() => void load()} type="button"><RefreshCw className="size-4" /></button></div> : null}

        <section className="mt-6 rounded-2xl border border-outline/70 bg-white p-4 shadow-card">
          <form className="flex gap-2" onSubmit={search}>
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search audit records</span>
              <Search className="absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-secondary" />
              <input className="min-h-12 w-full rounded-xl border border-outline py-3 pl-12 pr-3" onChange={(event) => setSearchInput(event.target.value)} placeholder="Action, resource, ID, admin name or email" value={searchInput} />
            </label>
            <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white" type="submit">Search</button>
          </form>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <Filter label="All actions" onChange={(value) => { setAction(value); setPage(1); }} options={facets?.actions.map((item) => [item.value, `${title(item.value)} (${item.count})`]) ?? []} value={action} />
            <Filter label="All resources" onChange={(value) => { setResourceType(value); setPage(1); }} options={facets?.resourceTypes.map((item) => [item.value, `${item.value} (${item.count})`]) ?? []} value={resourceType} />
            <Filter label="All administrators" onChange={(value) => { setAdminUserId(value); setPage(1); }} options={facets?.admins.map((admin) => [admin.id, admin.name]) ?? []} value={adminUserId} />
            <Filter label="All outcomes" onChange={(value) => { setSuccess(value); setPage(1); }} options={[["true", "Successful"], ["false", "Rejected"]]} value={success} />
            <DateFilter label="From" onChange={(value) => { setDateFrom(value); setPage(1); }} value={dateFrom} />
            <DateFilter label="To" onChange={(value) => { setDateTo(value); setPage(1); }} value={dateTo} />
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-outline/70 bg-white shadow-card">
          <div className="flex items-center justify-between border-b border-outline/70 px-5 py-4">
            <div><h2 className="font-heading text-xl font-semibold">Audit events</h2><p className="mt-1 text-xs text-text-secondary">{pagination.total} matching append-only records</p></div>
            <ShieldCheck className="size-5 text-primary" />
          </div>
          {loading ? <div className="grid min-h-64 place-items-center"><RefreshCw className="size-7 animate-spin text-primary" /></div> : entries.length ? (
            <div className="divide-y divide-outline/60">
              {entries.map((entry) => <AuditRow entry={entry} key={entry.id} />)}
            </div>
          ) : <div className="px-6 py-16 text-center"><FileClock className="mx-auto size-10 text-text-secondary" /><h3 className="mt-4 font-heading text-xl font-semibold">No matching events</h3><p className="mt-2 text-sm text-text-secondary">Adjust the audit filters and try again.</p></div>}
          <div className="flex items-center justify-between border-t border-outline/70 px-4 py-4 sm:px-5">
            <button className="page-btn" disabled={page <= 1 || loading} onClick={() => setPage((current) => Math.max(1, current - 1))} type="button"><ChevronLeft className="size-4" /> Previous</button>
            <span className="text-xs text-text-secondary">Page {pagination.page} of {pagination.totalPages}</span>
            <button className="page-btn" disabled={page >= pagination.totalPages || loading} onClick={() => setPage((current) => current + 1)} type="button">Next <ChevronRight className="size-4" /></button>
          </div>
        </section>
      </div>
    </main>
  );
}

function AuditRow({ entry }: { entry: AdminAuditEntry }) {
  return (
    <article className="p-4 sm:p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${entry.success ? "bg-green-50 text-primary" : "bg-red-50 text-error"}`}>{entry.success ? "Success" : "Rejected"}</span>
            <span className="rounded-full bg-background px-2.5 py-1 text-[11px] font-semibold">{entry.resourceType}</span>
          </div>
          <h3 className="mt-3 font-semibold">{title(entry.action)}</h3>
          <p className="mt-1 break-all font-mono text-[11px] text-text-secondary">{entry.resourceId ?? "No resource ID"}</p>
        </div>
        <div className="shrink-0 text-left text-xs text-text-secondary lg:text-right">
          <p>{date(entry.createdAt)}</p>
          <p className="mt-1 font-medium text-text-primary">{entry.adminUser?.name ?? "System / unknown actor"}</p>
          <p className="mt-1">{entry.ipAddress ?? "No IP"}</p>
        </div>
      </div>
      {entry.metadata !== null ? (
        <details className="mt-4 rounded-xl bg-background p-3">
          <summary className="cursor-pointer text-xs font-semibold text-primary">Sanitized metadata</summary>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap break-words text-xs leading-5 text-text-secondary">{JSON.stringify(entry.metadata, null, 2)}</pre>
        </details>
      ) : null}
    </article>
  );
}

function Filter({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: string[][]; value: string }) {
  return <select aria-label={label} className="min-h-11 rounded-xl border border-outline bg-white px-3 text-sm" onChange={(event) => onChange(event.target.value)} value={value}><option value="">{label}</option>{options.map(([key, text]) => <option key={key} value={key}>{text}</option>)}</select>;
}
function DateFilter({ label, onChange, value }: { label: string; onChange: (value: string) => void; value: string }) {
  return <label className="relative"><span className="pointer-events-none absolute left-3 top-1 text-[9px] font-semibold uppercase text-text-secondary">{label}</span><input aria-label={`${label} date`} className="min-h-11 w-full rounded-xl border border-outline px-3 pt-3 text-sm" onChange={(event) => onChange(event.target.value)} type="date" value={value} /></label>;
}
