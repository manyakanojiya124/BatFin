export type AnalyticsDomainKey =
  | "generic"
  | "finance"
  | "sales"
  | "hr"
  | "inventory"
  | "batfin";

export interface AnalyticsDomainPlugin {
  key: AnalyticsDomainKey;
  label: string;
  signals: RegExp[];
  dimensionPriority: RegExp[];
  measurePriority: RegExp[];
  riskFields: RegExp[];
  entityFields: RegExp[];
  geographyFields: RegExp[];
}

const generic: AnalyticsDomainPlugin = {
  key: "generic",
  label: "General business operations",
  signals: [],
  dimensionPriority: [
    /status/i,
    /category|class|type/i,
    /region|state|city|country|zone/i,
    /channel|source|segment/i,
  ],
  measurePriority: [
    /revenue|amount|value|balance/i,
    /quantity|units|volume/i,
    /cost|expense|margin|profit/i,
    /score|rate|ratio|percent/i,
  ],
  riskFields: [/risk|overdue|delinquen|default|fraud|npa|repo/i],
  entityFields: [/customer|vendor|supplier|partner|account|owner/i],
  geographyFields: [/region|state|city|country|zone|territory|location/i],
};

export const analyticsDomainRegistry: AnalyticsDomainPlugin[] = [
  {
    key: "batfin",
    label: "Lending and portfolio collections",
    signals: [
      /loan|emi|disburs|delinquen|npa|repo|bucket|contracted_demand/i,
      /battery.*dealer|dealer.*deployment_state/i,
    ],
    dimensionPriority: [
      /case_status|loan_status|account_status/i,
      /^bucket$|closing_bucket|dpd_bucket/i,
      /deployment_state/i,
      /dealer_home_state/i,
      /^dealer$|dealer_name/i,
      /vintage|tenure/i,
    ],
    measurePriority: [
      /contracted_demand|closing_pos|portfolio/i,
      /billed_to_date|collection|collected/i,
      /future_demand|outstanding|balance/i,
      /delinquent|npa|repo|overdue/i,
      /^emi|down_payment|^dp_/i,
    ],
    riskFields: [/delinquent|npa|repo|dpd|overdue|bounce|seizure|risk/i],
    entityFields: [/dealer|branch|partner|agency/i],
    geographyFields: [/deployment_state|dealer_home_state|state|region|zone|city/i],
  },
  {
    key: "finance",
    label: "Finance and accounting",
    signals: [/ledger|invoice|payment|receivable|payable/i, /expense|cost_center|accounting|journal/i],
    dimensionPriority: [/account|cost_center|department|payment_status|invoice_status/i],
    measurePriority: [/revenue|balance|amount|receivable|payable|expense|profit|margin/i],
    riskFields: [/overdue|default|writeoff|variance/i],
    entityFields: [/vendor|customer|account|cost_center/i],
    geographyFields: generic.geographyFields,
  },
  {
    key: "sales",
    label: "Sales and commercial operations",
    signals: [/sale|order|pipeline/i, /product|customer|channel/i, /revenue|margin|units/i],
    dimensionPriority: [/product|category|channel|segment|sales_rep|customer/i],
    measurePriority: [/revenue|sales|margin|profit|quantity|discount|order_value/i],
    riskFields: [/churn|return|cancel|discount/i],
    entityFields: [/customer|sales_rep|account|partner/i],
    geographyFields: generic.geographyFields,
  },
  {
    key: "hr",
    label: "People and workforce analytics",
    signals: [/employee|headcount|salary|department|designation|attrition/i],
    dimensionPriority: [/department|designation|job|employment|location|manager/i],
    measurePriority: [/salary|compensation|headcount|tenure|performance|hours/i],
    riskFields: [/attrition|absence|overtime|vacancy/i],
    entityFields: [/department|manager|team/i],
    geographyFields: generic.geographyFields,
  },
  {
    key: "inventory",
    label: "Inventory and supply operations",
    signals: [/inventory|stock|sku|warehouse|supplier|reorder/i],
    dimensionPriority: [/product|sku|category|warehouse|supplier|stock_status/i],
    measurePriority: [/quantity|stock|value|cost|reorder|lead_time|turnover/i],
    riskFields: [/stockout|reorder|damage|expiry|shortage/i],
    entityFields: [/supplier|warehouse|product|sku/i],
    geographyFields: generic.geographyFields,
  },
  generic,
];

function pluginScore(plugin: AnalyticsDomainPlugin, fields: string) {
  return plugin.signals.reduce((score, signal) => score + (signal.test(fields) ? 1 : 0), 0);
}

export function detectAnalyticsDomain(fields: string[]) {
  const joined = fields.join(" ");
  const ranked = analyticsDomainRegistry
    .filter((plugin) => plugin.key !== "generic")
    .map((plugin) => ({ plugin, score: pluginScore(plugin, joined) }))
    .sort((left, right) => right.score - left.score);
  return ranked[0] && ranked[0].score > 0 ? ranked[0].plugin : generic;
}

export function patternRank(value: string, patterns: RegExp[], fallback = 100) {
  const index = patterns.findIndex((pattern) => pattern.test(value));
  return index < 0 ? fallback : index;
}

export function matchesAny(value: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}
