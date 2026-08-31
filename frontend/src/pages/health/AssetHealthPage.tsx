import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  MapPinned,
  Power,
  RefreshCw,
  ShieldCheck,
  Thermometer,
  Wrench,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { BatteryRing } from "../../components/BatteryRing";
import { BottomNavigation } from "../../components/BottomNavigation";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { MiniMap } from "../../components/MiniMap";
import { PageHeader } from "../../components/PageHeader";
import {
  ApiClientError,
  getAsset,
  getAssetHealth,
  getAssetLocation,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type { Asset, AssetHealth, AssetLocation } from "../../types/api";

function initials(name: string) {
  return (
    name
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "BF"
  );
}

const healthPresentation = {
  healthy: {
    label: "Healthy",
    badge: "bg-success/10 text-primary",
    panel: "bg-success/10 text-primary",
    icon: CheckCircle2,
    message: "All available device readings are within the expected operating range.",
  },
  attention: {
    label: "Needs Attention",
    badge: "bg-warning/10 text-warning",
    panel: "bg-warning/10 text-warning",
    icon: AlertTriangle,
    message: "One or more readings are outside the preferred operating range.",
  },
  service_required: {
    label: "Service Required",
    badge: "bg-error/10 text-error",
    panel: "bg-error/10 text-error",
    icon: Wrench,
    message: "The asset should be inspected before continued operation.",
  },
} as const;

function HealthSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-12">
      <LoadingSkeleton className="h-96 rounded-card md:col-span-7" />
      <div className="grid grid-cols-2 gap-4 md:col-span-5">
        <LoadingSkeleton className="h-40 rounded-card" />
        <LoadingSkeleton className="h-40 rounded-card" />
        <LoadingSkeleton className="col-span-2 h-44 rounded-card" />
      </div>
      <LoadingSkeleton className="h-72 rounded-card md:col-span-12" />
    </div>
  );
}

export function AssetHealthPage() {
  const { id: assetId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [health, setHealth] = useState<AssetHealth | null>(null);
  const [location, setLocation] = useState<AssetLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const loadHealth = useCallback(
    async (isRefresh = false) => {
      if (!token || !assetId) return;

      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError("");

      try {
        const [assetResult, healthResult, locationResult] = await Promise.all([
          getAsset(token, assetId),
          getAssetHealth(token, assetId),
          getAssetLocation(token, assetId),
        ]);
        setAsset(assetResult.asset);
        setHealth(healthResult.health);
        setLocation(locationResult.location);
      } catch (requestError) {
        if (requestError instanceof ApiClientError && requestError.status === 401) {
          logout();
          navigate("/login", { replace: true });
          return;
        }
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Unable to load asset health.",
        );
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [assetId, logout, navigate, token],
  );

  useEffect(() => {
    void loadHealth();
  }, [loadHealth]);

  const presentation = health ? healthPresentation[health.status] : null;
  const StatusIcon = presentation?.icon ?? Activity;

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate(assetId ? `/assets/${assetId}` : "/assets")}
        title="BatFIN"
      />
      <main className="page-enter mx-auto w-full max-w-app px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <div className="mb-7 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text-secondary">Device diagnostics</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary sm:text-4xl">
              Asset Health
            </h1>
            {asset ? (
              <p className="mt-2 truncate text-sm font-medium tabular-nums text-text-secondary">
                {asset.serialNumber}
              </p>
            ) : null}
          </div>
          {health ? (
            <Button
              aria-label="Refresh asset health"
              className="shrink-0 px-3 sm:px-4"
              loading={refreshing}
              onClick={() => void loadHealth(true)}
              variant="ghost"
            >
              {!refreshing ? <RefreshCw aria-hidden="true" className="size-5" /> : null}
              <span className="hidden sm:inline">Refresh</span>
            </Button>
          ) : null}
        </div>

        {loading ? (
          <HealthSkeleton />
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load health</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadHealth()}>
              Try again
            </Button>
          </Card>
        ) : asset && health && presentation ? (
          <div className="grid gap-5 md:grid-cols-12">
            <Card className="relative overflow-hidden p-6 md:col-span-7 md:p-8">
              <div className="absolute -right-16 -top-16 size-56 rounded-full bg-success/10 blur-3xl" />
              <div className="relative flex h-full flex-col items-center justify-center">
                <span
                  className={`absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${presentation.badge}`}
                >
                  <span className="size-2 animate-pulse rounded-full bg-current" />
                  {presentation.label}
                </span>
                <BatteryRing label="Charge" level={health.batteryLevel} size="large" />
                <div className="mt-5 w-full border-t border-surface-container pt-5 text-center">
                  <h2 className="font-heading text-xl font-semibold text-text-primary">
                    {asset.productType}
                  </h2>
                  <p className="mt-1 text-sm capitalize text-text-secondary">
                    Operational status: {asset.status}
                  </p>
                </div>
              </div>
            </Card>

            <section className="grid grid-cols-2 gap-4 md:col-span-5" aria-label="Health metrics">
              <Card className="p-4 sm:p-5">
                <div className="grid size-10 place-items-center rounded-xl bg-surface-container text-text-primary">
                  <Thermometer aria-hidden="true" className="size-5" />
                </div>
                <p className="mt-4 text-xs font-medium text-text-secondary sm:text-sm">Temperature</p>
                <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-text-primary">
                  {health.temperature.toFixed(1)}°C
                </p>
              </Card>

              <Card className="p-4 sm:p-5">
                <div className="grid size-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Power aria-hidden="true" className="size-5" />
                </div>
                <p className="mt-4 text-xs font-medium text-text-secondary sm:text-sm">Asset State</p>
                <p className="mt-1 truncate font-heading text-xl font-semibold capitalize text-text-primary sm:text-2xl">
                  {asset.status}
                </p>
              </Card>

              <Card className="col-span-2 p-5">
                <div className={`flex items-start gap-4 rounded-2xl p-4 ${presentation.panel}`}>
                  <div className="grid size-11 shrink-0 place-items-center rounded-full bg-white shadow-sm">
                    <StatusIcon aria-hidden="true" className="size-6" />
                  </div>
                  <div>
                    <p className="font-semibold">
                      {health.serviceRequired ? "Service is required" : "No service required"}
                    </p>
                    <p className="mt-1 text-sm leading-5 text-on-surface-variant">
                      {presentation.message}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2 text-sm text-text-secondary">
                  <ShieldCheck aria-hidden="true" className="size-4 text-primary" />
                  Latest available device reading
                </div>
              </Card>
            </section>

            <Card className="p-5 md:col-span-12 md:p-6">
              <div className="mb-4 flex items-center gap-2">
                <MapPinned aria-hidden="true" className="size-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold text-text-primary">Live Location</h2>
              </div>
              {location ? <MiniMap location={location} /> : null}
            </Card>
          </div>
        ) : null}
      </main>
      <BottomNavigation active="assets" />
    </div>
  );
}
