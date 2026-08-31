import { Crosshair, MapPin } from "lucide-react";

import type { AssetLocation } from "../types/api";

export function MiniMap({ location }: { location: AssetLocation }) {
  if (
    !location.available ||
    location.latitude === null ||
    location.longitude === null
  ) {
    return (
      <div className="grid min-h-56 place-items-center rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center">
        <div>
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-white text-text-secondary shadow-sm">
            <Crosshair aria-hidden="true" className="size-6" />
          </div>
          <p className="mt-4 font-semibold text-text-primary">Location unavailable</p>
          <p className="mt-1 text-sm leading-5 text-text-secondary">
            This asset has not reported GPS coordinates yet.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      aria-label={`Asset location at ${location.latitude}, ${location.longitude}`}
      className="relative min-h-56 overflow-hidden rounded-2xl bg-[#edf2eb]"
      style={{
        backgroundImage:
          "linear-gradient(rgba(0,107,44,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(0,107,44,.08) 1px, transparent 1px), linear-gradient(35deg, transparent 46%, rgba(255,255,255,.9) 47%, rgba(255,255,255,.9) 53%, transparent 54%)",
        backgroundSize: "28px 28px, 28px 28px, 140px 140px",
      }}
    >
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-1/2 size-14 -translate-x-1/2 -translate-y-1/2 animate-ping rounded-full bg-primary/20" />
        <div className="relative grid size-11 place-items-center rounded-full border-4 border-white bg-primary text-white shadow-lg">
          <MapPin aria-hidden="true" className="size-5" fill="currentColor" />
        </div>
      </div>
      <div className="absolute bottom-3 left-3 right-3 rounded-xl bg-white/90 px-4 py-3 shadow-card backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
          Latest coordinates
        </p>
        <p className="mt-1 font-medium tabular-nums text-text-primary">
          {location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}
        </p>
      </div>
    </div>
  );
}
