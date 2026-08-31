import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { formatAnalyticsValue } from "../../utils/analytics-format";
import { DashboardFilters } from "./DashboardFilters";
import { DashboardWidget } from "./DashboardWidget";
import type { DashboardVisualizationSpec } from "../../types/analytics";

const kpi:DashboardVisualizationSpec={id:"kpi_amount",type:"KPI",title:"Amount",description:null,dimension:null,measure:"amount",secondaryMeasure:null,aggregation:"SUM",stackBy:null,columns:[],limit:1,timeGrain:"AUTO",sort:"VALUE_DESC",topN:1,showOther:false,formatOverride:"AUTO",layout:{x:0,y:0,w:6,h:2},visible:true};

describe("universal analytics refinements",()=>{
  it("formats INR values with Indian compact units and binary rates as percentages",()=>{
    expect(formatAnalyticsValue(12_500_000,{format:"CURRENCY",currencyCode:"INR"})).toBe("₹1.3Cr");
    expect(formatAnalyticsValue(0.125,{format:"PERCENTAGE"})).toBe("12.5%");
  });
  it("uses responsive grid classes without an inline grid span",()=>{
    const{container}=render(<DashboardWidget columns={[]} editable={false} loading={false} onCrossFilter={vi.fn()} onEdit={vi.fn()} onExpand={vi.fn()} onExport={vi.fn()} onOptions={vi.fn()} onPageChange={vi.fn()} onRefresh={vi.fn()} result={{mode:"AGGREGATE",dimension:null,measure:"amount",format:{format:"CURRENCY",currencyCode:"INR",unit:null,label:"Amount"},timeGrain:null,rows:[{dimension:null,value:1000,secondaryValue:null,rowCount:10}]}} visualization={kpi}/>);
    const article=container.querySelector("article");expect(article).toHaveClass("col-span-1","lg:col-span-6","min-h-[196px]");expect(article).not.toHaveAttribute("style");expect(screen.getAllByText("Amount")).toHaveLength(1);
  });
  it("renders compact searchable multi-select controls instead of a large native multi-select",()=>{
    const change=vi.fn();render(<DashboardFilters filters={[{id:"dealer",field:"dealer",label:"Dealer",type:"MULTI_SELECT"}]} onChange={change} onClear={vi.fn()} options={{dealer:["Dealer A","Dealer B"]}} values={{}}/>);
    expect(document.querySelector("select[multiple]")).toBeNull();fireEvent.click(screen.getAllByRole("button",{name:/Dealer/i})[0]!);fireEvent.click(screen.getByRole("button",{name:"Dealer A"}));expect(change).toHaveBeenCalledWith("dealer",expect.objectContaining({field:"dealer",values:["Dealer A"]}));
  });
});
