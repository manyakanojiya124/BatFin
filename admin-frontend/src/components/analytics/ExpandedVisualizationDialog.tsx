import { Download, RefreshCw, X } from "lucide-react";
import { useEffect, useId } from "react";
import type { AnalyticsColumn, DashboardQueryResult, DashboardVisualizationSpec } from "../../types/analytics";
import { VisualizationRenderer } from "./VisualizationRenderer";

interface Props {
  visualization:DashboardVisualizationSpec;
  result?:DashboardQueryResult;
  error?:string;
  loading:boolean;
  columns:AnalyticsColumn[];
  onClose:()=>void;
  onRefresh:()=>void;
  onPageChange:(page:number)=>void;
  onCrossFilter:(field:string,value:string)=>void;
  onExport:()=>void;
}
export function ExpandedVisualizationDialog({visualization,result,error,loading,columns,onClose,onRefresh,onPageChange,onCrossFilter,onExport}:Props){
  const titleId=useId();
  useEffect(()=>{const previous=document.body.style.overflow;document.body.style.overflow="hidden";const key=(event:KeyboardEvent)=>{if(event.key==="Escape")onClose()};window.addEventListener("keydown",key);return()=>{document.body.style.overflow=previous;window.removeEventListener("keydown",key)}},[onClose]);
  const table=visualization.type==="TABLE";
  return <div aria-labelledby={titleId} aria-modal="true" className="fixed inset-0 z-[80] bg-forest/70 p-2 backdrop-blur-sm sm:p-4" onMouseDown={onClose} role="dialog"><section className="mx-auto flex h-full w-full max-w-[1800px] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onMouseDown={event=>event.stopPropagation()}><header className="flex min-h-16 items-center justify-between gap-4 border-b border-outline px-4 py-3 sm:px-6"><div className="min-w-0"><p className="analytics-kicker">Expanded visualization</p><h2 className="truncate font-heading text-lg font-semibold sm:text-xl" id={titleId}>{visualization.title}</h2><p className="mt-0.5 truncate text-xs text-text-secondary">{visualization.description}</p></div><div className="flex shrink-0 items-center gap-1"><button aria-label="Export chart data" className="grid size-10 place-items-center rounded-lg border border-outline hover:bg-background" onClick={onExport} type="button"><Download className="size-4"/></button><button aria-label="Refresh expanded chart" className="grid size-10 place-items-center rounded-lg border border-outline hover:bg-background" onClick={onRefresh} type="button"><RefreshCw className={`size-4 ${loading?"animate-spin":""}`}/></button><button aria-label="Close expanded chart" className="grid size-10 place-items-center rounded-lg bg-forest text-white" onClick={onClose} type="button"><X className="size-5"/></button></div></header><div className={`relative min-h-0 flex-1 ${table?"p-0":"p-4 sm:p-6"}`}>{error&&!result?<div className="grid h-full place-items-center text-error">{error}</div>:result?<VisualizationRenderer columns={columns} onCrossFilter={onCrossFilter} onExport={onExport} onPageChange={onPageChange} result={result} visualization={visualization}/>:<div className="h-full animate-pulse rounded-xl bg-background"/>}{loading&&result?<div className="absolute inset-x-0 top-0 h-1 bg-brand-soft"><div className="h-full w-1/2 animate-pulse bg-primary"/></div>:null}</div></section></div>;
}
