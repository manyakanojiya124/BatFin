import { BatteryCharging, Bike, LockKeyhole, Power } from "lucide-react";

import type { AssetStatus, AssetType } from "../types/api";

export function AssetTypeIcon({
  assetType,
  className = "size-6",
}: {
  assetType: AssetType;
  className?: string;
}) {
  const Icon = assetType === "battery" ? BatteryCharging : Bike;
  return <Icon aria-hidden="true" className={className} strokeWidth={2} />;
}

const statusStyles: Record<AssetStatus, string> = {
  active: "border-success/20 bg-success/10 text-primary-container",
  locked: "border-error/20 bg-error/10 text-error",
  inactive: "border-outline-variant bg-surface-container text-text-secondary",
};

export function AssetStatusBadge({ status }: { status: AssetStatus }) {
  const Icon = status === "locked" ? LockKeyhole : Power;
  const label = status.charAt(0).toUpperCase() + status.slice(1);

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold ${statusStyles[status]}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {label}
    </span>
  );
}
