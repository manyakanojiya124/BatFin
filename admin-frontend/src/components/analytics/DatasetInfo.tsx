import { CheckCircle2, Columns3, Database, Rows3 } from "lucide-react";
export function DatasetInfo({name,rows,columns,version,domain}:{name:string;rows:number;columns:number;version:number;domain?:string}) {
  return <section className="analytics-panel flex flex-wrap items-center gap-4 p-4 sm:px-5">
    <span className="grid size-10 place-items-center rounded-lg bg-brand-soft text-primary"><Database className="size-5"/></span>
    <div className="min-w-0 flex-1"><p className="truncate font-semibold">{name}</p><p className="text-xs text-text-secondary">Version {version}{domain ? ` · ${domain}` : ""}</p></div>
    <div className="flex w-full items-center justify-between gap-4 border-t border-outline pt-3 text-xs text-text-secondary sm:w-auto sm:border-l sm:border-t-0 sm:pl-5 sm:pt-0">
      <span className="flex items-center gap-2"><Rows3 className="size-4"/><strong className="text-sm tabular-nums text-text-primary">{rows.toLocaleString("en-IN")}</strong> rows</span>
      <span className="flex items-center gap-2"><Columns3 className="size-4"/><strong className="text-sm tabular-nums text-text-primary">{columns}</strong> columns</span>
      <span className="hidden items-center gap-1 text-success lg:flex"><CheckCircle2 className="size-4"/>Ready</span>
    </div>
  </section>;
}
