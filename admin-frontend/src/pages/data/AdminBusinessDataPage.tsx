import {
  AlertTriangle,
  CheckCircle2,
  Database,
  FileClock,
  FileSpreadsheet,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AdminApiError,
  getMasterDataCatalog,
  getMasterDataSummary,
  listMasterDataImports,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type {
  MasterDataImportJob,
  MasterDataSummary,
  MasterDatasetCatalogItem,
} from "../../types/master-data";

function currency(value: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 2 }).format(value);
}
function date(value: string | null) {
  return value ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Never";
}

export function AdminBusinessDataPage() {
  const navigate = useNavigate();
  const clearSession = useAdminStore((state) => state.clearSession);
  const [datasets, setDatasets] = useState<MasterDatasetCatalogItem[]>([]);
  const [summary, setSummary] = useState<MasterDataSummary | null>(null);
  const [imports, setImports] = useState<MasterDataImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [catalog, stats, history] = await Promise.all([
        getMasterDataCatalog(),
        getMasterDataSummary(),
        listMasterDataImports({ page: 1, pageSize: 8 }),
      ]);
      setDatasets(catalog.datasets); setSummary(stats.summary); setImports(history.jobs);
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession(); navigate("/login", { replace: true }); return;
      }
      setError(requestError instanceof Error ? requestError.message : "Unable to load business data");
    } finally { setLoading(false); }
  }, [clearSession, navigate]);
  useEffect(() => { void load(); }, [load]);

  const cards = summary ? [
    ["Sections", summary.sectionCount, Database, "bg-blue-50 text-secondary"],
    ["Populated", summary.populatedSectionCount, CheckCircle2, "bg-green-50 text-primary"],
    ["Current records", summary.currentRecordCount, FileSpreadsheet, "bg-purple-50 text-purple-700"],
    ["Record versions", summary.versionCount, FileClock, "bg-teal-50 text-teal-700"],
    ["Completed imports", summary.completedImportCount, TrendingUp, "bg-amber-50 text-warning"],
    ["Restricted sections", summary.restrictedSectionCount, LockKeyhole, "bg-red-50 text-error"],
  ] as const : [];

  return <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10"><div className="mx-auto max-w-7xl">
    <div><p className="text-sm text-text-secondary">Super Admin · governed imports</p><h1 className="mt-1 font-heading text-3xl font-semibold">Business Data</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-text-secondary">Validated master configuration, staff-directory, and data-minimized Collection MIS sections. Every CSV is hashed, previewed, transactionally imported, versioned by business key, and audited.</p></div>
    <div className="mt-5 flex items-start gap-3 rounded-2xl border border-green-200 bg-green-50 p-4 text-sm leading-6 text-green-900"><ShieldCheck className="mt-0.5 size-5 shrink-0" /><p>No uploaded CSV is stored as a raw blob. Collection identity documents, personal names, phones, and full addresses are discarded before PostgreSQL writes. Staff records never create admin accounts.</p></div>
    {error ? <div className="mt-5 flex items-start justify-between gap-4 rounded-xl bg-red-50 p-4 text-sm text-error"><span className="flex gap-3"><AlertTriangle className="size-5 shrink-0" />{error}</span><button aria-label="Retry" onClick={() => void load()} type="button"><RefreshCw className="size-4" /></button></div> : null}
    <section className="mt-7 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">{cards.map(([label, value, Icon, tone]) => <article className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card" key={label}><span className={`grid size-10 place-items-center rounded-xl ${tone}`}><Icon className="size-5" /></span><p className="mt-3 text-xs text-text-secondary">{label}</p><p className="mt-1 font-heading text-2xl font-semibold">{value}</p></article>)}</section>
    {summary?.collectionMetrics.accountCount ? <section className="mt-6 grid gap-4 rounded-2xl bg-forest p-5 text-white shadow-card sm:grid-cols-2 lg:grid-cols-4"><div><p className="text-xs text-white/60">Collection accounts</p><p className="mt-2 font-heading text-2xl font-semibold">{summary.collectionMetrics.accountCount}</p></div><div><p className="text-xs text-white/60">Closing POS</p><p className="mt-2 font-heading text-2xl font-semibold">{currency(summary.collectionMetrics.closingPos)}</p></div><div><p className="text-xs text-white/60">Closing overdue</p><p className="mt-2 font-heading text-2xl font-semibold text-red-300">{currency(summary.collectionMetrics.closingOverdue)}</p></div><div><p className="text-xs text-white/60">DPD &gt; 0</p><p className="mt-2 font-heading text-2xl font-semibold text-amber-300">{summary.collectionMetrics.delinquentAccounts}</p></div></section> : null}
    <section className="mt-7"><div className="flex items-end justify-between"><div><p className="text-sm text-text-secondary">Import registry</p><h2 className="font-heading text-2xl font-semibold">Configured sections</h2></div><span className="text-xs text-text-secondary">{datasets.length} templates</span></div>{loading ? <div className="mt-5 grid min-h-64 place-items-center rounded-2xl bg-white"><RefreshCw className="size-7 animate-spin text-primary" /></div> : <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{datasets.map((dataset) => <Link className="group rounded-2xl border border-outline/70 bg-white p-5 shadow-card transition hover:-translate-y-0.5 hover:border-green-200" key={dataset.type} to={`/data/${dataset.type}`}><div className="flex items-start justify-between gap-4"><span className={`grid size-11 place-items-center rounded-xl ${dataset.privacy === "restricted" ? "bg-red-50 text-error" : "bg-green-50 text-primary"}`}>{dataset.privacy === "restricted" ? <LockKeyhole className="size-5" /> : <Database className="size-5" />}</span><span className="rounded-full bg-background px-3 py-1 text-xs font-semibold">{dataset.recordCount} records</span></div><h3 className="mt-4 font-heading text-xl font-semibold group-hover:text-primary">{dataset.label}</h3><p className="mt-2 line-clamp-3 text-sm leading-6 text-text-secondary">{dataset.description}</p><div className="mt-4 flex items-center justify-between border-t border-outline/60 pt-4 text-xs text-text-secondary"><span>{dataset.sourceFileHint}</span><span>{dataset.latestImport ? date(dataset.latestImport.completedAt) : "Not imported"}</span></div></Link>)}</div>}</section>
    <section className="mt-8 overflow-hidden rounded-2xl border border-outline/70 bg-white shadow-card"><div className="flex items-center justify-between border-b border-outline/70 px-5 py-4"><div><p className="text-sm text-text-secondary">Latest activity</p><h2 className="font-heading text-xl font-semibold">Import history</h2></div><FileClock className="size-5 text-primary" /></div>{imports.length ? <div className="divide-y divide-outline/60">{imports.map((job) => <div className="grid gap-3 p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_140px_190px] lg:items-center" key={job.id}><div><Link className="font-semibold hover:text-primary" to={`/data/${job.datasetType}`}>{datasets.find((item) => item.type === job.datasetType)?.label ?? job.datasetType}</Link><p className="mt-1 text-xs text-text-secondary">{job.sourceFileName} · {job.importedBy.name}</p><p className="mt-1 font-mono text-[10px] text-text-secondary">SHA-256 {job.sourceHash.slice(0, 20)}…</p></div><span className={`w-fit rounded-full px-3 py-1 text-xs font-semibold capitalize ${job.status === "completed" ? "bg-green-50 text-primary" : "bg-red-50 text-error"}`}>{job.status}</span><div className="text-xs text-text-secondary"><p>{job.insertedCount} inserted · {job.updatedCount} updated</p><p className="mt-1">{date(job.completedAt)}</p></div></div>)}</div> : <p className="px-5 py-12 text-center text-sm text-text-secondary">No files imported yet.</p>}</section>
  </div></main>;
}
