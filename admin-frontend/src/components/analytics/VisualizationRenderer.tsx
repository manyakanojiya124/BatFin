import type { AnalyticsColumn, DashboardQueryResult, DashboardVisualizationSpec } from "../../types/analytics";
import { ChartWidget } from "./ChartWidget";
import { KPIWidget } from "./KPIWidget";
import { TableWidget } from "./TableWidget";

interface Props {visualization:DashboardVisualizationSpec;result:DashboardQueryResult;columns:AnalyticsColumn[];onCrossFilter?:(field:string,value:string)=>void;onPageChange?:(page:number)=>void;onExport?:()=>void;}
export function VisualizationRenderer({visualization,result,columns,onCrossFilter,onPageChange,onExport}:Props){
  if(result.mode==="TABLE"){
    const labels=Object.fromEntries(columns.map(column=>[column.normalizedName,column.displayName]));
    return <TableWidget labels={labels} onExport={onExport} onPageChange={onPageChange} result={result}/>;
  }
  if(result.mode==="HISTOGRAM"||result.mode==="CORRELATION")return <div className="grid h-full place-items-center text-sm text-text-secondary">This analytical result is available through Ask Data.</div>;
  if(visualization.type==="KPI"){
    const first=result.rows[0];return <KPIWidget format={result.format} formatOverride={visualization.formatOverride} rowCount={first?.rowCount??0} title={visualization.title} value={first?.value??null}/>;
  }
  return <ChartWidget onSelect={onCrossFilter} result={result} visualization={visualization}/>;
}
