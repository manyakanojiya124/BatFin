import { AlertCircle, ArrowLeft, Check, Clipboard, Plus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link } from "react-router-dom";

import { createAdminInventoryAsset } from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { InventoryAsset } from "../../types/inventory";

export function AdminCreateAssetPage() {
  const csrfToken = useAdminStore((state) => state.csrfToken);
  const [assetType, setAssetType] = useState<"battery" | "vehicle">("battery");
  const [productType, setProductType] = useState("Battery L5");
  const [serialNumber, setSerialNumber] = useState("");
  const [vehicleNumber, setVehicleNumber] = useState("");
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<{ asset: InventoryAsset; qrData: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!csrfToken) return;
    setLoading(true); setError("");
    try {
      const response = await createAdminInventoryAsset(csrfToken, {
        assetType,
        productType,
        ...(serialNumber.trim() ? { serialNumber: serialNumber.trim() } : {}),
        ...(vehicleNumber.trim() ? { vehicleNumber: vehicleNumber.trim() } : {}),
        reason,
      });
      setResult(response);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to create asset");
    } finally { setLoading(false); }
  }

  async function copyQr() {
    if (!result) return;
    await navigator.clipboard.writeText(result.qrData);
    setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  if (result) {
    return (
      <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
        <div className="mx-auto max-w-3xl">
          <div className="rounded-3xl bg-white p-6 text-center shadow-card sm:p-8">
            <span className="mx-auto grid size-16 place-items-center rounded-full bg-green-50 text-primary"><Check className="size-8" /></span>
            <h1 className="mt-5 font-heading text-3xl font-semibold">Inventory asset created</h1>
            <p className="mt-2 font-mono text-sm text-text-secondary">{result.asset.serialNumber}</p>
            <div className="mx-auto mt-6 w-fit rounded-2xl border border-outline bg-white p-4"><QRCodeSVG level="M" size={240} value={result.qrData} /></div>
            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-text-secondary">This signed QR contains a random token. Only its SHA-256 hash is stored in PostgreSQL.</p>
            <div className="mt-6 flex flex-col justify-center gap-3 sm:flex-row">
              <button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-outline px-5 text-sm font-semibold" onClick={() => void copyQr()} type="button"><Clipboard className="size-4" />{copied ? "Copied" : "Copy QR payload"}</button>
              <Link className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-white" to={`/inventory/${result.asset.id}`}>Open inventory record</Link>
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10">
      <div className="mx-auto max-w-3xl">
        <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/inventory"><ArrowLeft className="size-4" /> Inventory</Link>
        <div className="mt-5 rounded-3xl bg-white p-6 shadow-card sm:p-8">
          <p className="text-sm text-text-secondary">Individual issuance</p>
          <h1 className="mt-1 font-heading text-3xl font-semibold">Create inventory asset</h1>
          <p className="mt-2 text-sm text-text-secondary">Leave the serial blank to generate a collision-checked BatFIN serial automatically.</p>
          {error ? <div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-3 text-sm text-error"><AlertCircle className="size-5" />{error}</div> : null}
          <form className="mt-7 grid gap-5 sm:grid-cols-2" onSubmit={submit}>
            <SelectField label="Asset type" onChange={(value) => { const type=value as "battery"|"vehicle"; setAssetType(type); setProductType(type === "battery" ? "Battery L5" : "Electric 2 Wheeler"); }} options={[["battery","Battery"],["vehicle","Vehicle"]]} value={assetType} />
            <InputField label="Product type" onChange={setProductType} value={productType} />
            <InputField label="Serial number (optional)" onChange={(value) => setSerialNumber(value.toUpperCase().replace(/\s/g,""))} placeholder="Auto-generate" required={false} value={serialNumber} />
            {assetType === "vehicle" ? <InputField label="Vehicle number (optional)" onChange={setVehicleNumber} required={false} value={vehicleNumber} /> : <div />}
            <label className="sm:col-span-2 text-sm font-medium">Audit reason<textarea className="mt-2 min-h-24 w-full rounded-xl border border-outline p-3 outline-none focus:border-primary focus:ring-4 focus:ring-green-100" onChange={(event) => setReason(event.target.value)} placeholder="Explain why this inventory record is being created" required value={reason} /></label>
            <button className="sm:col-span-2 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60" disabled={loading} type="submit"><Plus className="size-4" />{loading ? "Creating…" : "Create asset and signed QR"}</button>
          </form>
        </div>
      </div>
    </main>
  );
}

function InputField({ label, onChange, placeholder, required = true, value }: { label: string; onChange: (value: string) => void; placeholder?: string; required?: boolean; value: string }) { return <label className="text-sm font-medium">{label}<input className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 outline-none focus:border-primary focus:ring-4 focus:ring-green-100" onChange={(event) => onChange(event.target.value)} placeholder={placeholder} required={required} value={value} /></label>; }
function SelectField({ label, onChange, options, value }: { label: string; onChange: (value: string) => void; options: Array<[string,string]>; value: string }) { return <label className="text-sm font-medium">{label}<select className="mt-2 min-h-12 w-full rounded-xl border border-outline bg-white px-4" onChange={(event) => onChange(event.target.value)} value={value}>{options.map(([key,text]) => <option key={key} value={key}>{text}</option>)}</select></label>; }
