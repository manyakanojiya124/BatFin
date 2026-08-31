import { BrainCircuit, Copy, Download, Edit3, ExternalLink, GitCompareArrows, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";

interface Props {
  title:string; description:string; dataset:string; updatedAt:string; editable:boolean; saving:boolean; regenerating:boolean;
  onToggleEdit:()=>void; onSave:()=>void; onRefresh:()=>void; onRegenerate:()=>void; onDuplicate:()=>void; onDelete:()=>void;
  onExport:()=>void; onAsk:()=>void; onPresent:()=>void; onAddComparison:()=>void;
}
export function DashboardHeader(props:Props) {
  return <header className="overflow-hidden rounded-2xl bg-forest text-white shadow-analytics">
    <div className="flex flex-col gap-6 p-5 sm:p-7 lg:flex-row lg:items-end lg:justify-between lg:p-8">
      <div className="min-w-0">
        <div className="flex items-center gap-3">
          <img alt="BatFIN" className="size-9 rounded-lg bg-white object-contain p-1" src="/LOGO.png" />
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-cyan-200">Universal business intelligence</p>
        </div>
        <h1 className="mt-4 max-w-4xl font-heading text-2xl font-semibold leading-tight sm:text-4xl">{props.title}</h1>
        <p className="mt-3 max-w-3xl text-sm leading-6 text-white/65">{props.description}</p>
        <p className="mt-3 text-xs text-white/45">Source: {props.dataset} · Updated {new Intl.DateTimeFormat("en-IN", { dateStyle:"medium", timeStyle:"short" }).format(new Date(props.updatedAt))}</p>
      </div>
      <div className="flex flex-wrap gap-2 lg:max-w-xl lg:justify-end">
        <button className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold hover:bg-cyan-700" onClick={props.onAsk} type="button"><Sparkles className="size-4"/>Ask data</button>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10" onClick={props.onAddComparison} type="button"><GitCompareArrows className="size-4"/><span className="hidden sm:inline">Add chart</span></button>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10" onClick={props.onPresent} type="button"><ExternalLink className="size-4"/><span className="hidden sm:inline">Presentation</span></button>
        <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10" onClick={props.onExport} type="button"><Download className="size-4"/><span className="hidden sm:inline">Export</span></button>
        {props.editable
          ? <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10" disabled={props.saving} onClick={props.onSave} type="button"><Save className="size-4"/>{props.saving ? "Saving…" : "Save"}</button>
          : <button className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 text-sm font-semibold hover:bg-white/10" onClick={props.onToggleEdit} type="button"><Edit3 className="size-4"/><span className="hidden sm:inline">Edit</span></button>}
        <button aria-label="Refresh dashboard" className="grid size-11 place-items-center rounded-lg border border-white/20 hover:bg-white/10" onClick={props.onRefresh} type="button"><RefreshCw className="size-4"/></button>
        <button aria-label="Regenerate dashboard" className="grid size-11 place-items-center rounded-lg border border-white/20 hover:bg-white/10" disabled={props.regenerating} onClick={props.onRegenerate} type="button"><BrainCircuit className={`size-4 ${props.regenerating ? "animate-pulse" : ""}`}/></button>
        <button aria-label="Duplicate dashboard" className="grid size-11 place-items-center rounded-lg border border-white/20 hover:bg-white/10" onClick={props.onDuplicate} type="button"><Copy className="size-4"/></button>
        <button aria-label="Delete dashboard" className="grid size-11 place-items-center rounded-lg border border-red-300/30 text-red-200 hover:bg-red-500/10" onClick={props.onDelete} type="button"><Trash2 className="size-4"/></button>
      </div>
    </div>
  </header>;
}
