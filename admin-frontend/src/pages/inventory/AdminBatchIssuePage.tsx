import { AlertCircle, ArrowLeft, CheckCircle2, Download, FileSpreadsheet, Upload } from "lucide-react";
import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import { Link } from "react-router-dom";

import { createAdminAssetBatch } from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { BatchIssueResult } from "../../types/inventory";

type BatchMode = "generate" | "import";

function parseSerials(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.split(",")[0]?.trim().replace(/^"|"$/g, "") ?? "")
    .filter((line) => line && line.toLowerCase() !== "serialnumber")
    .map((line) => line.toUpperCase());
}

function csvEscape(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

export function AdminBatchIssuePage() {
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const [mode, setMode] = useState<BatchMode>("generate");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState<"battery" | "vehicle">("battery");
  const [productType, setProductType] = useState("Battery L5");
  const [quantity, setQuantity] = useState("10");
  const [csvText, setCsvText] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<BatchIssueResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const serials = useMemo(() => parseSerials(csvText), [csvText]);

  async function readFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) setCsvText(await file.text());
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    if (mode === "import" && serials.length === 0) {
      setError("Upload or paste at least one serial number.");
      return;
    }
    setLoading(true); setError("");
    try {
      const response = await createAdminAssetBatch(csrfToken, {
        name,
        assetType,
        productType,
        ...(mode === "generate" ? { quantity: Number(quantity) } : { serialNumbers: serials }),
        reason,
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to issue batch");
    } finally { setLoading(false); }
  }

  function downloadResults() {
    if (!result) return;
    const rows = [
      ["assetId", "serialNumber", "assetType", "productType", "signedQrPayload"],
      ...result.items.map((item) => [item.asset.id, item.asset.serialNumber, item.asset.assetType, item.asset.productType, item.qrData]),
    ];
    const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const link = document.createElement("a"); link.href = url; link.download = `${result.batch.name.replace(/[^A-Za-z0-9_-]+/g,"-")}-results.csv`; link.click(); URL.revokeObjectURL(url);
  }

  if (result) {
    return (
      <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10"><div className="mx-auto max-w-5xl">
        <section className="rounded-3xl bg-white p-6 shadow-card sm:p-8">
          <CheckCircle2 className="size-12 text-primary" /><h1 className="mt-4 font-heading text-3xl font-semibold">Batch issuance complete</h1><p className="mt-2 text-text-secondary">{result.batch.name} · {result.items.length} signed inventory records</p>
          <button className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-white" onClick={downloadResults} type="button"><Download className="size-4" /> Download signed CSV results</button>
          <div className="mt-6 overflow-x-auto rounded-2xl border border-outline"><table className="w-full min-w-[720px] text-left"><thead className="bg-background text-xs uppercase text-text-secondary"><tr><th className="p-3">Serial</th><th className="p-3">Asset ID</th><th className="p-3">QR payload</th></tr></thead><tbody className="divide-y divide-outline/60">{result.items.slice(0,20).map((item)=><tr key={item.asset.id}><td className="p-3 font-mono text-sm">{item.asset.serialNumber}</td><td className="p-3 font-mono text-xs">{item.asset.id}</td><td className="max-w-md truncate p-3 font-mono text-xs">{item.qrData}</td></tr>)}</tbody></table></div>
          {result.items.length > 20 ? <p className="mt-3 text-sm text-text-secondary">Showing the first 20 records. Download the CSV for all results.</p> : null}
          <Link className="mt-6 inline-flex text-sm font-semibold text-primary" to="/inventory">Return to inventory</Link>
        </section>
      </div></main>
    );
  }

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10"><div className="mx-auto max-w-4xl">
      <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/inventory"><ArrowLeft className="size-4" /> Inventory</Link>
      <section className="mt-5 rounded-3xl bg-white p-6 shadow-card sm:p-8">
        <p className="text-sm text-text-secondary">CSV or generated issuance</p><h1 className="mt-1 font-heading text-3xl font-semibold">Create inventory batch</h1><p className="mt-2 text-sm text-text-secondary">Issue up to 500 collision-checked serials and signed QR payloads in one database transaction.</p>
        <div className="mt-6 grid grid-cols-2 gap-2 rounded-xl bg-background p-1"><ModeButton active={mode==="generate"} label="Generate serials" onClick={()=>setMode("generate")} /><ModeButton active={mode==="import"} label="Import CSV" onClick={()=>setMode("import")} /></div>
        {error ? <div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error"><AlertCircle className="size-5" />{error}</div> : null}
        <form className="mt-6 grid gap-5 sm:grid-cols-2" onSubmit={submit}>
          <Field label="Batch name" onChange={setName} value={name} />
          <label className="text-sm font-medium">Asset type<select className="mt-2 min-h-12 w-full rounded-xl border border-outline bg-white px-4" onChange={(event)=>{const type=event.target.value as "battery"|"vehicle";setAssetType(type);setProductType(type==="battery"?"Battery L5":"Electric 2 Wheeler");}} value={assetType}><option value="battery">Battery</option><option value="vehicle">Vehicle</option></select></label>
          <Field label="Product type" onChange={setProductType} value={productType} />
          {mode === "generate" ? <Field label="Quantity (1–500)" onChange={setQuantity} type="number" value={quantity} /> : <div />}
          {mode === "import" ? <div className="sm:col-span-2 rounded-2xl border border-dashed border-outline p-5"><label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl bg-background px-4 text-sm font-semibold"><Upload className="size-4" /> Select CSV<input accept=".csv,text/csv" className="sr-only" onChange={(event)=>void readFile(event)} type="file" /></label><p className="mt-3 text-sm text-text-secondary">One serial number per row. A `serialNumber` header is optional.</p><textarea className="mt-4 min-h-40 w-full rounded-xl border border-outline p-3 font-mono text-xs" onChange={(event)=>setCsvText(event.target.value)} placeholder={'serialNumber\nBAT-2026-0001\nBAT-2026-0002'} value={csvText} /><p className="mt-2 text-sm font-semibold text-primary">{serials.length} valid rows detected</p></div> : null}
          <label className="sm:col-span-2 text-sm font-medium">Audit reason<textarea className="mt-2 min-h-24 w-full rounded-xl border border-outline p-3" onChange={(event)=>setReason(event.target.value)} required value={reason} /></label>
          <button className="sm:col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit"><FileSpreadsheet className="size-4" />{loading ? "Issuing batch…" : `Issue ${mode === "generate" ? quantity : serials.length} assets`}</button>
        </form>
      </section>
    </div></main>
  );
}

function ModeButton({ active, label, onClick }: { active:boolean; label:string; onClick:()=>void }) { return <button className={`min-h-11 rounded-lg text-sm font-semibold ${active?"bg-white text-primary shadow-card":"text-text-secondary"}`} onClick={onClick} type="button">{label}</button>; }
function Field({ label, onChange, type="text", value }: { label:string; onChange:(value:string)=>void; type?:string; value:string }) { return <label className="text-sm font-medium">{label}<input className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4" max={type==="number"?500:undefined} min={type==="number"?1:undefined} onChange={(event)=>onChange(event.target.value)} required type={type} value={value} /></label>; }
