import { Check, ChevronDown, Filter, Search, SlidersHorizontal, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { DashboardFilterSpec, DashboardQueryFilter } from "../../types/analytics";

interface Props {
  filters:DashboardFilterSpec[]; values:Record<string,DashboardQueryFilter>; options:Record<string,string[]>;
  onChange:(id:string,value:DashboardQueryFilter|null)=>void; onClear:()=>void;
  onSearchOptions?:(filter:DashboardFilterSpec,search:string)=>void;
}
function selectedCount(value?:DashboardQueryFilter) {
  if (!value) return 0;
  if (value.values) return value.values.length;
  return value.value !== undefined || value.from !== undefined || value.to !== undefined ? 1 : 0;
}
function labelFor(filter:DashboardFilterSpec,value?:DashboardQueryFilter) {
  const count=selectedCount(value);
  if (!count) return filter.label;
  if (value?.values?.length===1) return `${filter.label}: ${String(value.values[0])}`;
  if (value?.value!==undefined) return `${filter.label}: ${String(value.value)}`;
  return `${filter.label} · ${count}`;
}

function FilterEditor({filter,value,options,onChange,onSearch}:{filter:DashboardFilterSpec;value?:DashboardQueryFilter;options:string[];onChange:(value:DashboardQueryFilter|null)=>void;onSearch?:(search:string)=>void}) {
  const [search,setSearch]=useState("");
  useEffect(()=>{const timer=window.setTimeout(()=>onSearch?.(search),250);return()=>window.clearTimeout(timer)},[onSearch,search]);
  const visible=useMemo(()=>options.filter(option=>option.toLowerCase().includes(search.toLowerCase())),[options,search]);
  if(filter.type==="DATE_RANGE"||filter.type==="NUMERIC_RANGE"){
    const type=filter.type==="DATE_RANGE"?"date":"number";
    const update=(from:string,to:string)=>onChange(from||to?{field:filter.field,type:filter.type,from:from||undefined,to:to||undefined}:null);
    return <div className="space-y-3 p-3"><p className="text-xs font-semibold text-text-secondary">Choose a range</p><label className="block text-xs">From<input className="mt-1 min-h-10 w-full rounded-lg border border-outline px-3" onChange={event=>update(event.target.value,String(value?.to??""))} type={type} value={String(value?.from??"")}/></label><label className="block text-xs">To<input className="mt-1 min-h-10 w-full rounded-lg border border-outline px-3" onChange={event=>update(String(value?.from??""),event.target.value)} type={type} value={String(value?.to??"")}/></label></div>;
  }
  if(filter.type==="BOOLEAN") return <div className="space-y-1 p-2">{([ ["All",null],["Yes",true],["No",false] ] as const).map(([label,choice])=><button className="flex min-h-10 w-full items-center justify-between rounded-lg px-3 text-left text-sm hover:bg-brand-soft" key={label} onClick={()=>onChange(choice===null?null:{field:filter.field,type:"BOOLEAN",value:choice})} type="button">{label}{value?.value===choice?<Check className="size-4 text-primary"/>:null}</button>)}</div>;
  if(filter.type==="SEARCH") return <div className="p-3"><label className="relative block"><Search className="absolute left-3 top-3 size-4 text-text-secondary"/><input autoFocus className="min-h-10 w-full rounded-lg border border-outline pl-9 pr-3 text-sm" onChange={event=>{setSearch(event.target.value);onChange(event.target.value?{field:filter.field,type:"SEARCH",value:event.target.value}:null)}} placeholder={`Search ${filter.label.toLowerCase()}`} value={String(value?.value??"")}/></label></div>;
  const multiple=filter.type==="MULTI_SELECT";
  const selected=(value?.values??(value?.value!==undefined?[value.value]:[])).map(String);
  const toggle=(option:string)=>{
    if(!multiple){onChange(selected[0]===option?null:{field:filter.field,type:"SELECT",value:option});return;}
    const next=selected.includes(option)?selected.filter(item=>item!==option):[...selected,option];
    onChange(next.length?{field:filter.field,type:"MULTI_SELECT",values:next}:null);
  };
  return <div className="p-2">
    <label className="relative mb-2 block"><Search className="absolute left-3 top-3 size-4 text-text-secondary"/><input className="min-h-10 w-full rounded-lg border border-outline pl-9 pr-3 text-sm" onChange={event=>setSearch(event.target.value)} placeholder="Find a value…" value={search}/></label>
    {multiple?<div className="mb-1 flex items-center justify-between px-2 text-xs"><button className="font-semibold text-primary" onClick={()=>onChange(visible.length?{field:filter.field,type:"MULTI_SELECT",values:visible}:null)} type="button">Select visible</button><button className="text-text-secondary" onClick={()=>onChange(null)} type="button">Clear</button></div>:null}
    <div className="analytics-scrollbar max-h-64 overflow-y-auto">{visible.map(option=><button className="flex min-h-10 w-full items-center justify-between gap-3 rounded-lg px-3 text-left text-sm hover:bg-brand-soft" key={option} onClick={()=>toggle(option)} type="button"><span className="truncate">{option}</span><span className={`grid size-4 shrink-0 place-items-center rounded ${selected.includes(option)?"bg-primary text-white":"border border-outline"}`}>{selected.includes(option)?<Check className="size-3"/>:null}</span></button>)}{!visible.length?<p className="p-5 text-center text-xs text-text-secondary">No matching values</p>:null}</div>
  </div>;
}

export function DashboardFilters({filters,values,options,onChange,onClear,onSearchOptions}:Props){
  const[open,setOpen]=useState<string|null>(null);const[mobile,setMobile]=useState(false);
  if(!filters.length)return null;
  const active=filters.filter(filter=>selectedCount(values[filter.id])>0);
  const controls=<div className="flex flex-wrap gap-2">{filters.map(filter=>{
    const count=selectedCount(values[filter.id]);const isOpen=open===filter.id;
    return <div className="relative" key={filter.id}><button aria-expanded={isOpen} className={`inline-flex min-h-10 max-w-[260px] items-center gap-2 rounded-lg border px-3 text-sm font-medium transition ${count?"border-primary bg-brand-soft text-primary":"border-outline bg-white hover:border-primary/50"}`} onClick={()=>setOpen(isOpen?null:filter.id)} type="button"><span className="truncate">{labelFor(filter,values[filter.id])}</span>{count>1?<span className="rounded bg-primary px-1.5 text-[10px] text-white">{count}</span>:null}<ChevronDown className="size-3.5 shrink-0"/></button>{isOpen?<div className="absolute left-0 z-30 mt-2 w-[min(320px,calc(100vw-2rem))] rounded-xl border border-outline bg-white shadow-analytics"><div className="flex items-center justify-between border-b border-outline px-3 py-2"><p className="text-sm font-semibold">{filter.label}</p><button aria-label="Close filter" className="grid size-8 place-items-center rounded-lg hover:bg-background" onClick={()=>setOpen(null)} type="button"><X className="size-4"/></button></div><FilterEditor filter={filter} onChange={value=>onChange(filter.id,value)} onSearch={search=>onSearchOptions?.(filter,search)} options={options[filter.id]??[]} value={values[filter.id]}/></div>:null}</div>})}</div>;
  return <section className="analytics-panel p-4 sm:p-5">
    <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-primary"><Filter className="size-4"/></span><div><h2 className="text-sm font-semibold">Filters</h2><p className="hidden text-xs text-text-secondary sm:block">All widgets update together</p></div></div><div className="flex gap-2"><button className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-text-secondary hover:bg-background" disabled={!active.length} onClick={onClear} type="button"><X className="size-3.5"/>Clear all</button><button className="inline-flex min-h-9 items-center gap-2 rounded-lg border border-outline px-3 text-xs font-semibold sm:hidden" onClick={()=>setMobile(true)} type="button"><SlidersHorizontal className="size-4"/>Choose</button></div></div>
    <div className="mt-4 hidden sm:block">{controls}</div>
    {active.length?<div className="mt-3 flex flex-wrap gap-2 border-t border-outline pt-3">{active.map(filter=><button className="inline-flex items-center gap-1 rounded-full bg-brand-soft px-3 py-1 text-xs text-primary" key={filter.id} onClick={()=>onChange(filter.id,null)} type="button">{labelFor(filter,values[filter.id])}<X className="size-3"/></button>)}</div>:null}
    {mobile?<div className="fixed inset-0 z-50 bg-forest/40" onMouseDown={()=>setMobile(false)}><div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-white p-4" onMouseDown={event=>event.stopPropagation()}><div className="flex items-center justify-between"><h2 className="font-heading text-lg font-semibold">Dashboard filters</h2><button className="grid size-10 place-items-center" onClick={()=>setMobile(false)} type="button"><X className="size-5"/></button></div><div className="mt-4">{controls}</div><button className="mt-5 min-h-12 w-full rounded-lg bg-primary font-semibold text-white" onClick={()=>setMobile(false)} type="button">Apply filters</button></div></div>:null}
  </section>;
}
