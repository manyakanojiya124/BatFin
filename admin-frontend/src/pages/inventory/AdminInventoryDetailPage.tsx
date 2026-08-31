import {
  AlertCircle,
  ArrowLeft,
  BatteryCharging,
  CheckCircle2,
  Clipboard,
  KeyRound,
  Link2,
  QrCode,
  RefreshCw,
  Unlink,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Link, useParams } from "react-router-dom";

import {
  assignAdminAsset,
  getAdminInventoryAsset,
  listAdminCustomers,
  rotateAdminAssetQr,
  unassignAdminAsset,
  updateAdminAssetLifecycle,
  verifyAdminStepUp,
} from "../../services/api";
import { useAdminStore } from "../../store/admin.store";
import type { CustomerListItem } from "../../types/customer";
import type { InventoryAsset, InventoryStatus } from "../../types/inventory";

type Action = "assign" | "unassign" | "qr" | "maintenance" | "available" | "retired";

const statusStyles: Record<string,string> = { available:"bg-green-50 text-primary", assigned:"bg-blue-50 text-secondary", maintenance:"bg-amber-50 text-warning", retired:"bg-red-50 text-error" };

export function AdminInventoryDetailPage() {
  const { id } = useParams();
  const csrfToken = useAdminStore((state)=>state.csrfToken);
  const [asset,setAsset]=useState<InventoryAsset|null>(null); const [customers,setCustomers]=useState<CustomerListItem[]>([]);
  const [loading,setLoading]=useState(true); const [error,setError]=useState(""); const [notice,setNotice]=useState("");
  const [action,setAction]=useState<Action|null>(null); const [reason,setReason]=useState(""); const [code,setCode]=useState(""); const [customerId,setCustomerId]=useState(""); const [actionLoading,setActionLoading]=useState(false); const [qrData,setQrData]=useState(""); const [copied,setCopied]=useState(false);

  const load=useCallback(async()=>{ if(!id)return; setLoading(true);setError("");try{const [a,c]=await Promise.all([getAdminInventoryAsset(id),listAdminCustomers({status:"active",page:1,pageSize:100})]);setAsset(a.asset);setCustomers(c.customers);setCustomerId(c.customers[0]?.id??"");}catch(e){setError(e instanceof Error?e.message:"Unable to load inventory asset");}finally{setLoading(false);}},[id]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!notice)return;const t=window.setTimeout(()=>setNotice(""),5000);return()=>window.clearTimeout(t);},[notice]);

  async function execute(event:FormEvent<HTMLFormElement>){event.preventDefault();if(!csrfToken||!id||!action)return;setActionLoading(true);setError("");try{await verifyAdminStepUp(csrfToken,code);if(action==="assign"){await assignAdminAsset(csrfToken,id,customerId,reason);}else if(action==="unassign"){await unassignAdminAsset(csrfToken,id,reason);}else if(action==="qr"){const r=await rotateAdminAssetQr(csrfToken,id,reason);setQrData(r.qrData);}else{await updateAdminAssetLifecycle(csrfToken,id,action as Exclude<InventoryStatus,"assigned">,reason);}setNotice(`Inventory action ${action} completed and audited.`);setAction(null);setReason("");setCode("");await load();}catch(e){setError(e instanceof Error?e.message:"Inventory action failed");}finally{setActionLoading(false);}}
  async function copyQr(){await navigator.clipboard.writeText(qrData);setCopied(true);setTimeout(()=>setCopied(false),1500);}

  if(loading&&!asset)return <main className="grid min-h-[70vh] place-items-center"><RefreshCw className="size-8 animate-spin text-primary" /></main>;
  if(!asset)return <main className="p-8 text-center text-error">{error||"Asset not found"}</main>;

  return <main className="px-4 py-7 sm:px-6 lg:px-8 lg:py-10"><div className="mx-auto max-w-7xl">
    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-primary" to="/inventory"><ArrowLeft className="size-4" /> Inventory</Link>
    <section className="mt-5 flex flex-col gap-5 rounded-3xl bg-white p-6 shadow-card lg:flex-row lg:items-center lg:justify-between lg:p-8"><div className="flex items-center gap-4"><span className="grid size-16 place-items-center rounded-2xl bg-green-50 text-primary"><BatteryCharging className="size-8" /></span><div><div className="flex flex-wrap items-center gap-3"><h1 className="font-heading text-3xl font-semibold">{asset.productType}</h1><span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${statusStyles[asset.inventoryStatus]}`}>{asset.inventoryStatus}</span></div><p className="mt-2 font-mono text-sm text-text-secondary">{asset.serialNumber}</p></div></div><div className="flex flex-wrap gap-2"><button className="action-btn" onClick={()=>setAction("qr")} type="button"><QrCode className="size-4" /> Rotate QR</button>{asset.user?<button className="action-btn" onClick={()=>setAction("unassign")} type="button"><Unlink className="size-4" /> Unassign</button>:asset.inventoryStatus==="available"?<button className="action-btn" onClick={()=>setAction("assign")} type="button"><Link2 className="size-4" /> Assign</button>:null}{asset.inventoryStatus!=="retired"?<button className="action-btn" onClick={()=>setAction(asset.inventoryStatus==="maintenance"?"available":"maintenance")} type="button"><Wrench className="size-4" />{asset.inventoryStatus==="maintenance"?"Return available":"Maintenance"}</button>:null}{!asset.user&&asset.inventoryStatus!=="retired"?<button className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-error" onClick={()=>setAction("retired")} type="button">Retire</button>:null}</div></section>
    {notice?<div className="mt-5 flex gap-3 rounded-xl bg-green-50 p-4 text-sm text-primary"><CheckCircle2 className="size-5" />{notice}</div>:null}{error?<div className="mt-5 flex gap-3 rounded-xl bg-red-50 p-4 text-sm text-error"><AlertCircle className="size-5" />{error}</div>:null}
    <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]"><div className="space-y-6"><section className="rounded-2xl border border-outline/70 bg-white p-6 shadow-card"><h2 className="font-heading text-xl font-semibold">Inventory identity</h2><dl className="mt-5 grid gap-4 sm:grid-cols-2"><Info label="Asset ID" value={asset.id}/><Info label="Serial" value={asset.serialNumber}/><Info label="Asset type" value={asset.assetType}/><Info label="Operational state" value={asset.status}/><Info label="Vehicle number" value={asset.vehicleNumber||"Not applicable"}/><Info label="Batch" value={asset.batch?.name||"Individual issuance"}/><Info label="Created by" value={asset.createdByAdmin?.name||"Customer onboarding"}/><Info label="Created" value={new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short'}).format(new Date(asset.createdAt))}/></dl></section>
    <section className="rounded-2xl border border-outline/70 bg-white p-6 shadow-card"><h2 className="font-heading text-xl font-semibold">Device telemetry</h2><div className="mt-5 grid grid-cols-2 gap-4"><Metric label="Battery" value={asset.batteryLevel===null?"—":`${asset.batteryLevel}%`}/><Metric label="Temperature" value={asset.temperature===null?"—":`${asset.temperature}°C`}/></div></section></div>
    <aside className="space-y-6"><section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card"><h2 className="font-heading text-xl font-semibold">Assignment</h2>{asset.user?<div className="mt-4 rounded-xl bg-background p-4"><p className="font-semibold">{asset.user.name}</p><p className="mt-1 text-sm text-text-secondary">{asset.user.phone}</p><p className="mt-2 text-xs capitalize text-primary">{asset.user.accountStatus}</p></div>:<p className="mt-4 text-sm text-text-secondary">This inventory record is unassigned.</p>}</section><section className="rounded-2xl border border-outline/70 bg-white p-5 shadow-card"><h2 className="font-heading text-xl font-semibold">QR identity</h2><div className="mt-4 space-y-3 text-sm"><div className="flex justify-between"><span className="text-text-secondary">Issued</span><span>{asset.qrIssuedAt?"Yes":"No"}</span></div><div className="flex justify-between"><span className="text-text-secondary">Verified</span><span className={asset.verifiedAt?"text-primary":"text-warning"}>{asset.verifiedAt?"Verified":"Pending"}</span></div></div></section></aside></div>
  </div>
  {action?<Modal title={actionTitle(action)} onClose={()=>!actionLoading&&setAction(null)}><form className="space-y-4" onSubmit={execute}>{error?<div className="rounded-xl bg-red-50 p-3 text-sm text-error">{error}</div>:null}{action==="assign"?<label className="block text-sm font-medium">Active customer<select className="mt-2 min-h-12 w-full rounded-xl border border-outline bg-white px-3" onChange={(e)=>setCustomerId(e.target.value)} value={customerId}>{customers.map(c=><option key={c.id} value={c.id}>{c.name} · {c.phone}</option>)}</select></label>:null}<label className="block text-sm font-medium">Audit reason<textarea className="mt-2 min-h-24 w-full rounded-xl border border-outline p-3" onChange={(e)=>setReason(e.target.value)} required value={reason}/></label><label className="block text-sm font-medium">Authenticator code<input className="mt-2 min-h-12 w-full rounded-xl border border-outline px-4 text-center font-mono text-lg tracking-[0.2em]" inputMode="numeric" maxLength={6} onChange={(e)=>setCode(e.target.value.replace(/\D/g,""))} required value={code}/></label><div className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><KeyRound className="size-4 shrink-0" />Fresh TOTP step-up and an audit reason are required.</div><button className="inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white disabled:opacity-60" disabled={actionLoading|| (action==="assign"&&!customerId)} type="submit">{actionLoading?"Processing…":"Confirm audited action"}</button></form></Modal>:null}
  {qrData?<Modal title="New signed QR" onClose={()=>setQrData("")}><div className="text-center"><div className="mx-auto w-fit rounded-xl border border-outline p-3"><QRCodeSVG size={220} value={qrData}/></div><p className="mt-4 text-sm text-text-secondary">The previous QR token is now invalid.</p><button className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-outline px-4 text-sm font-semibold" onClick={()=>void copyQr()} type="button"><Clipboard className="size-4" />{copied?"Copied":"Copy payload"}</button></div></Modal>:null}
  </main>;
}

function actionTitle(action:Action){return({assign:"Assign customer",unassign:"Unassign customer",qr:"Rotate signed QR",maintenance:"Move to maintenance",available:"Return to available",retired:"Retire asset"})[action];}
function Info({label,value}:{label:string;value:string}){return <div><dt className="text-xs text-text-secondary">{label}</dt><dd className="mt-1 break-all font-medium capitalize">{value}</dd></div>;}
function Metric({label,value}:{label:string;value:string}){return <div className="rounded-xl bg-background p-4"><p className="text-xs text-text-secondary">{label}</p><p className="mt-2 font-heading text-2xl font-semibold">{value}</p></div>;}
function Modal({children,onClose,title}:{children:ReactNode;onClose:()=>void;title:string}){return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4 backdrop-blur-sm"><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><div className="flex justify-between gap-3"><h2 className="font-heading text-2xl font-semibold">{title}</h2><button className="grid size-10 place-items-center rounded-full hover:bg-background" onClick={onClose} type="button"><X className="size-5" /></button></div><div className="mt-5">{children}</div></section></div>;}
