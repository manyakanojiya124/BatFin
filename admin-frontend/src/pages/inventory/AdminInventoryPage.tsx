import {
  Boxes,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Plus,
  QrCode,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";

import {
  AdminApiError,
  getAdminInventorySummary,
  listAdminAssetBatches,
  listAdminInventory,
  verifyAdminAssetQr,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { AssetBatch, InventoryAsset, InventorySummary } from "../../types/inventory";

const statusStyles: Record<string, string> = {
  available: "bg-green-50 text-primary",
  assigned: "bg-blue-50 text-secondary",
  maintenance: "bg-amber-50 text-warning",
  retired: "bg-red-50 text-error",
};

export function AdminInventoryPage() {
  const navigate = useNavigate();
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const clearSession = useAdminStore((state) => state.clearSession);
  const [assets, setAssets] = useState<InventoryAsset[]>([]);
  const [summary, setSummary] = useState<InventorySummary | null>(null);
  const [batches, setBatches] = useState<AssetBatch[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [query, setQuery] = useState("");
  const [assetType, setAssetType] = useState("");
  const [inventoryStatus, setInventoryStatus] = useState("");
  const [assignment, setAssignment] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [qrData, setQrData] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [assetResult, summaryResult, batchResult] = await Promise.all([
        listAdminInventory({
          q: query,
          assetType,
          inventoryStatus,
          assignment,
          page,
          pageSize: 20,
        }),
        getAdminInventorySummary(),
        listAdminAssetBatches(1, 5),
      ]);
      setAssets(assetResult.assets);
      setTotal(assetResult.pagination.total);
      setTotalPages(assetResult.pagination.totalPages);
      setSummary(summaryResult.summary);
      setBatches(batchResult.batches);
    } catch (requestError) {
      if (requestError instanceof AdminApiError && requestError.status === 401) {
        clearSession();
        navigate("/login", { replace: true });
        return;
      }
      setError(requestError instanceof Error ? requestError.message : "Unable to load inventory");
    } finally {
      setLoading(false);
    }
  }, [assetType, assignment, clearSession, inventoryStatus, navigate, page, query]);

  useEffect(() => {
    void load();
  }, [load]);

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPage(1);
    setQuery(searchInput.trim());
  }

  async function verifyQr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setVerifying(true);
    setError("");
    try {
      const result = await verifyAdminAssetQr(csrfToken, qrData.trim());
      setVerifyMessage(`Verified ${result.asset.serialNumber}`);
      setQrData("");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "QR verification failed");
    } finally {
      setVerifying(false);
    }
  }

  const metricCards = summary
    ? [
        ["Total inventory", summary.total],
        ["Assigned", summary.assigned],
        ["Available", summary.available],
        ["Maintenance", summary.maintenance],
        ["QR verified", summary.qrVerified],
      ]
    : [];

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-text-secondary">Operations inventory</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary">Inventory & QR</h1>
            <p className="mt-2 text-sm text-text-secondary">Issue serials, generate signed QRs, verify scans, and manage asset assignment lifecycle.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline bg-white px-4 text-sm font-semibold text-text-primary" onClick={() => setVerifyOpen(true)} type="button">
              <QrCode className="size-4" /> Verify QR
            </button>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline bg-white px-4 text-sm font-semibold text-text-primary" to="/inventory/batches/new">
              <FileSpreadsheet className="size-4" /> New batch
            </Link>
            <Link className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-white" to="/inventory/new">
              <Plus className="size-4" /> Add asset
            </Link>
          </div>
        </div>

        <section className="mt-7 grid grid-cols-2 gap-4 lg:grid-cols-5">
          {metricCards.map(([label, value]) => (
            <article className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card" key={label}>
              <Boxes className="size-5 text-primary" />
              <p className="mt-3 text-sm text-text-secondary">{label}</p>
              <p className="mt-1 font-heading text-2xl font-semibold text-text-primary">{value}</p>
            </article>
          ))}
        </section>

        {verifyMessage ? (
          <div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm font-semibold text-primary" role="status">
            <CheckCircle2 className="size-5" /> {verifyMessage}
          </div>
        ) : null}
        {error ? (
          <div className="mt-5 flex items-center justify-between gap-4 rounded-xl bg-red-50 p-4 text-sm text-error" role="alert">
            <span>{error}</span>
            <button onClick={() => void load()} type="button"><RefreshCw className="size-4" /></button>
          </div>
        ) : null}

        <section className="mt-6 rounded-2xl border border-outline/70 bg-white p-4 shadow-card sm:p-5">
          <form className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_180px_190px_190px_auto]" onSubmit={search}>
            <label className="relative">
              <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-text-secondary" />
              <input className="min-h-12 w-full rounded-xl border border-outline py-3 pl-12 pr-4 outline-none focus:border-primary focus:ring-4 focus:ring-green-100" onChange={(event) => setSearchInput(event.target.value)} placeholder="Serial, product, vehicle or customer" value={searchInput} />
            </label>
            <FilterSelect label="All asset types" onChange={(value) => { setAssetType(value); setPage(1); }} options={[['battery','Battery'],['vehicle','Vehicle']]} value={assetType} />
            <FilterSelect label="All lifecycle states" onChange={(value) => { setInventoryStatus(value); setPage(1); }} options={[['available','Available'],['assigned','Assigned'],['maintenance','Maintenance'],['retired','Retired']]} value={inventoryStatus} />
            <FilterSelect label="All assignments" onChange={(value) => { setAssignment(value); setPage(1); }} options={[['assigned','Assigned'],['unassigned','Unassigned']]} value={assignment} />
            <button className="min-h-12 rounded-xl bg-primary px-5 text-sm font-semibold text-white" type="submit">Search</button>
          </form>
        </section>

        <section className="mt-6 overflow-hidden rounded-2xl border border-outline/70 bg-white shadow-card">
          {loading ? (
            <div className="space-y-3 p-5">{Array.from({ length: 5 }, (_, i) => <div className="h-16 animate-pulse rounded-xl bg-background" key={i} />)}</div>
          ) : assets.length === 0 ? (
            <div className="py-16 text-center"><Boxes className="mx-auto size-10 text-text-secondary" /><h2 className="mt-4 font-heading text-xl font-semibold">No inventory found</h2></div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[1050px] text-left">
                  <thead className="bg-background text-xs font-semibold uppercase tracking-wider text-text-secondary"><tr><th className="px-5 py-4">Asset</th><th className="px-5 py-4">Type</th><th className="px-5 py-4">Lifecycle</th><th className="px-5 py-4">Assignment</th><th className="px-5 py-4">QR</th><th className="px-5 py-4">Created</th><th className="px-5 py-4" /></tr></thead>
                  <tbody className="divide-y divide-outline/60">
                    {assets.map((asset) => <InventoryRow asset={asset} key={asset.id} />)}
                  </tbody>
                </table>
              </div>
              <div className="divide-y divide-outline/60 md:hidden">{assets.map((asset) => <InventoryCard asset={asset} key={asset.id} />)}</div>
            </>
          )}
        </section>

        <div className="mt-6 flex items-center justify-between gap-4">
          <p className="text-sm text-text-secondary">{total} assets · Page {page} of {totalPages}</p>
          <div className="flex gap-2">
            <button className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-outline bg-white px-3 text-sm font-semibold disabled:opacity-40" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)} type="button"><ChevronLeft className="size-4" /> Previous</button>
            <button className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-outline bg-white px-3 text-sm font-semibold disabled:opacity-40" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)} type="button">Next <ChevronRight className="size-4" /></button>
          </div>
        </div>

        <section className="mt-10">
          <div className="flex items-end justify-between"><div><p className="text-sm text-text-secondary">Latest issuance runs</p><h2 className="font-heading text-2xl font-semibold">Recent batches</h2></div><Link className="text-sm font-semibold text-primary" to="/inventory/batches/new">Create batch</Link></div>
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {batches.length ? batches.map((batch) => (
              <article className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card" key={batch.id}>
                <div className="flex justify-between gap-3"><FileSpreadsheet className="size-5 text-primary" /><span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-semibold capitalize text-primary">{batch.status}</span></div>
                <p className="mt-4 font-semibold text-text-primary">{batch.name}</p><p className="mt-1 text-sm text-text-secondary">{batch.quantity} {batch.productType}</p>
              </article>
            )) : <p className="text-sm text-text-secondary">No batches issued yet.</p>}
          </div>
        </section>
      </div>

      {verifyOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm">
          <section className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between"><div><p className="text-sm text-text-secondary">Signed inventory identity</p><h2 className="font-heading text-2xl font-semibold">Verify asset QR</h2></div><button className="grid size-10 place-items-center rounded-full hover:bg-background" onClick={() => setVerifyOpen(false)} type="button"><X className="size-5" /></button></div>
            <form className="mt-5" onSubmit={verifyQr}>
              <label className="text-sm font-medium text-text-primary">QR payload<textarea className="mt-2 min-h-40 w-full resize-y rounded-xl border border-outline p-3 font-mono text-xs outline-none focus:border-primary focus:ring-4 focus:ring-green-100" onChange={(event) => setQrData(event.target.value)} placeholder="Paste the BTF1 signed QR payload" required value={qrData} /></label>
              <div className="mt-4 flex items-start gap-2 rounded-xl bg-green-50 p-3 text-xs leading-5 text-primary"><ShieldCheck className="mt-0.5 size-4 shrink-0" />The API validates the HMAC signature, asset identity, current token hash, and lifecycle state.</div>
              <button className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60" disabled={verifying} type="submit"><QrCode className="size-4" />{verifying ? "Verifying…" : "Verify signed QR"}</button>
            </form>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function FilterSelect({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string,string]>; value: string }) {
  return <select className="min-h-12 rounded-xl border border-outline bg-white px-3 outline-none focus:border-primary focus:ring-4 focus:ring-green-100" onChange={(event) => onChange(event.target.value)} value={value}><option value="">{label}</option>{options.map(([key,text]) => <option key={key} value={key}>{text}</option>)}</select>;
}

function InventoryRow({ asset }: { asset: InventoryAsset }) {
  return <tr className="hover:bg-background/70"><td className="px-5 py-4"><p className="font-semibold text-text-primary">{asset.productType}</p><p className="mt-1 font-mono text-xs text-text-secondary">{asset.serialNumber}</p></td><td className="px-5 py-4 text-sm capitalize">{asset.assetType}</td><td className="px-5 py-4"><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[asset.inventoryStatus]}`}>{asset.inventoryStatus}</span></td><td className="px-5 py-4 text-sm">{asset.user ? <><p className="font-semibold">{asset.user.name}</p><p className="text-xs text-text-secondary">{asset.user.phone}</p></> : <span className="text-text-secondary">Unassigned</span>}</td><td className="px-5 py-4 text-sm">{asset.verifiedAt ? <span className="text-primary">Verified</span> : asset.qrIssuedAt ? <span className="text-warning">Issued</span> : "Not issued"}</td><td className="px-5 py-4 text-sm text-text-secondary">{new Intl.DateTimeFormat('en-IN',{day:'numeric',month:'short',year:'numeric'}).format(new Date(asset.createdAt))}</td><td className="px-5 py-4 text-right"><Link className="font-semibold text-primary" to={`/inventory/${asset.id}`}>Open</Link></td></tr>;
}

function InventoryCard({ asset }: { asset: InventoryAsset }) {
  return <Link className="block p-5" to={`/inventory/${asset.id}`}><div className="flex justify-between gap-3"><div><p className="font-semibold">{asset.productType}</p><p className="mt-1 font-mono text-xs text-text-secondary">{asset.serialNumber}</p></div><span className={`h-fit rounded-full px-2 py-1 text-[10px] font-semibold capitalize ${statusStyles[asset.inventoryStatus]}`}>{asset.inventoryStatus}</span></div><p className="mt-3 text-xs text-text-secondary">{asset.user ? `Assigned to ${asset.user.name}` : "Unassigned"}</p></Link>;
}
