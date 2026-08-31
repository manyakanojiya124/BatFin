import type { DashboardVisualizationSpec, MeasureFormatMeta } from "../../types/analytics";
import { formatWithMeta } from "../../utils/analytics-format";
export function KPIWidget({title,value,rowCount,format,formatOverride="AUTO"}:{title:string;value:number|null;rowCount:number;format?:MeasureFormatMeta;formatOverride?:DashboardVisualizationSpec["formatOverride"]}){
  return <div className="flex h-full min-h-0 flex-col justify-between overflow-hidden rounded-xl bg-gradient-to-br from-forest to-[#1B2536] p-5 text-white">
    <p className="max-w-[calc(100%-4rem)] text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-white/60">{title}</p>
    <p className="my-3 truncate font-heading text-3xl font-semibold leading-none tabular-nums" title={formatWithMeta(value,format,formatOverride??"AUTO",false)}>{formatWithMeta(value,format,formatOverride??"AUTO")}</p>
    <p className="text-[11px] leading-4 text-white/50">Based on {rowCount.toLocaleString("en-IN")} matching record{rowCount===1?"":"s"}</p>
  </div>;
}
