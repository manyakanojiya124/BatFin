import type { AnalyticsFormat, MeasureFormatMeta } from "../types/analytics";

export interface FormatOptions {
  format?: AnalyticsFormat | "AUTO";
  currencyCode?: string | null;
  unit?: string | null;
  compact?: boolean;
  maximumFractionDigits?: number;
}

function indianCompact(value: number, currencyPrefix = "") {
  const absolute = Math.abs(value);
  const sign = value < 0 ? "−" : "";
  const units = absolute >= 10_000_000
    ? { divisor: 10_000_000, suffix: "Cr" }
    : absolute >= 100_000
      ? { divisor: 100_000, suffix: "L" }
      : absolute >= 1_000
        ? { divisor: 1_000, suffix: "K" }
        : null;
  if (!units) return null;
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 1 }).format(absolute / units.divisor);
  return `${sign}${currencyPrefix}${formatted}${units.suffix}`;
}

export function formatAnalyticsValue(value: number | null | undefined, options: FormatOptions = {}) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const format = options.format === "AUTO" || !options.format ? "NUMBER" : options.format;
  const maximumFractionDigits = options.maximumFractionDigits ?? 2;
  if (format === "PERCENTAGE") {
    const percentage = Math.abs(value) <= 1 ? value * 100 : value;
    return `${new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(percentage)}%`;
  }
  if (format === "CURRENCY") {
    const currency = options.currencyCode ?? "INR";
    if (currency === "INR" && options.compact !== false) {
      const compact = indianCompact(value, "₹");
      if (compact) return compact;
    }
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency,
      maximumFractionDigits,
      notation: options.compact && Math.abs(value) >= 1_000_000 ? "compact" : "standard",
    }).format(value);
  }
  if (options.compact !== false) {
    const compact = indianCompact(value);
    if (compact) return options.unit ? `${compact} ${options.unit}` : compact;
  }
  const formatted = new Intl.NumberFormat("en-IN", { maximumFractionDigits }).format(value);
  return options.unit ? `${formatted} ${options.unit}` : formatted;
}

export function formatWithMeta(value: number | null | undefined, meta?: Partial<MeasureFormatMeta> | null, override: AnalyticsFormat | "AUTO" = "AUTO", compact = true) {
  return formatAnalyticsValue(value, {
    format: override === "AUTO" ? meta?.format ?? "NUMBER" : override,
    currencyCode: meta?.currencyCode,
    unit: meta?.unit,
    compact,
  });
}

export function formatDateLabel(value: string, grain?: string | null) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (grain === "YEAR") return new Intl.DateTimeFormat("en-IN", { year: "numeric" }).format(date);
  if (grain === "QUARTER") return `Q${Math.floor(date.getMonth() / 3) + 1} ${date.getFullYear()}`;
  if (grain === "MONTH") return new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric" }).format(date);
  if (grain === "WEEK" || grain === "DAY") return new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
  return new Intl.DateTimeFormat("en-IN", { dateStyle: "medium" }).format(date);
}

export function formatTableValue(value: unknown, dataType?: string) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number") return formatAnalyticsValue(value, { compact: false });
  if ((dataType === "DATE" || dataType === "DATETIME") && typeof value === "string") return formatDateLabel(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return String(value);
}
