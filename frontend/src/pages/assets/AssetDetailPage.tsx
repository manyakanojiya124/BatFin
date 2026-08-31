import {
  BatteryCharging,
  CalendarDays,
  Copy,
  Gauge,
  Hash,
  HeartPulse,
  LockKeyhole,
  MapPinned,
  RefreshCw,
  Thermometer,
  UnlockKeyhole,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { AssetStatusBadge, AssetTypeIcon } from "../../components/AssetVisuals";
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
  getAssetLocation,
  lockAsset,
  unlockAsset,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type { Asset, AssetLocation } from "../../types/api";

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

function AssetDetailSkeleton() {
  return (
    <div className="grid gap-5 md:grid-cols-12">
      <LoadingSkeleton className="h-64 rounded-card md:col-span-5" />
      <LoadingSkeleton className="h-64 rounded-card md:col-span-7" />
      <LoadingSkeleton className="h-56 rounded-card md:col-span-6" />
      <LoadingSkeleton className="h-56 rounded-card md:col-span-6" />
    </div>
  );
}

export function AssetDetailPage() {
  const { id: assetId } = useParams();
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [location, setLocation] = useState<AssetLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<"lock" | "unlock" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleUnauthorized = useCallback(() => {
    logout();
    navigate("/login", { replace: true });
  }, [logout, navigate]);

  const loadAsset = useCallback(async () => {
    if (!token || !assetId) return;

    setLoading(true);
    setError("");
    try {
      const [assetResult, locationResult] = await Promise.all([
        getAsset(token, assetId),
        getAssetLocation(token, assetId),
      ]);
      setAsset(assetResult.asset);
      setLocation(locationResult.location);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        handleUnauthorized();
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load this asset.",
      );
    } finally {
      setLoading(false);
    }
  }, [assetId, handleUnauthorized, token]);

  useEffect(() => {
    void loadAsset();
  }, [loadAsset]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function handleLockAction() {
    if (!token || !assetId || !confirming) return;

    setActionLoading(true);
    setActionError("");
    try {
      const result =
        confirming === "lock"
          ? await lockAsset(token, assetId)
          : await unlockAsset(token, assetId);
      setAsset(result.asset);
      setNotice(
        confirming === "lock"
          ? "Asset locked successfully."
          : "Asset unlocked successfully.",
      );
      setConfirming(null);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        handleUnauthorized();
        return;
      }
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to update the asset.",
      );
    } finally {
      setActionLoading(false);
    }
  }

  async function copySerialNumber() {
    if (!asset) return;
    try {
      await navigator.clipboard.writeText(asset.serialNumber);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate("/assets")}
        title="BatFIN"
      />
      <main className="page-enter mx-auto w-full max-w-app px-4 py-6 md:px-8 md:py-10">
        <div className="mb-7 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-secondary">Connected asset</p>
            <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary">
              Asset Details
            </h1>
            {asset ? (
              <Link
                className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                to={`/assets/${asset.id}/health`}
              >
                <HeartPulse aria-hidden="true" className="size-4" />
                View Asset Health
              </Link>
            ) : null}
          </div>
          {asset ? <AssetStatusBadge status={asset.status} /> : null}
        </div>

        {loading ? (
          <AssetDetailSkeleton />
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load asset</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button onClick={() => void loadAsset()}>Try again</Button>
              <Button onClick={() => navigate("/assets")} variant="secondary">
                Back to assets
              </Button>
            </div>
          </Card>
        ) : asset ? (
          <div className="grid gap-5 md:grid-cols-12">
            {notice ? (
              <div
                className="rounded-xl bg-success/10 px-4 py-3 text-sm font-medium text-primary md:col-span-12"
                role="status"
              >
                {notice}
              </div>
            ) : null}

            <Card className="relative overflow-hidden p-6 md:col-span-5">
              <div className="absolute -right-10 -top-10 size-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="relative">
                <div className="flex items-center gap-4">
                  <div className="grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <AssetTypeIcon assetType={asset.assetType} className="size-7" />
                  </div>
                  <div>
                    <p className="text-sm capitalize text-text-secondary">{asset.assetType}</p>
                    <h2 className="font-heading text-2xl font-semibold text-text-primary">
                      {asset.productType}
                    </h2>
                  </div>
                </div>

                <dl className="mt-7 space-y-5 text-sm">
                  <div className="flex items-start gap-3">
                    <Hash aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <dt className="text-text-secondary">Serial Number</dt>
                      <dd className="mt-1 flex items-center gap-2 font-semibold tabular-nums text-text-primary">
                        <span className="truncate">{asset.serialNumber}</span>
                        <button
                          aria-label="Copy serial number"
                          className="shrink-0 rounded-lg p-1 text-primary hover:bg-primary/10"
                          onClick={() => void copySerialNumber()}
                          type="button"
                        >
                          <Copy aria-hidden="true" className="size-4" />
                        </button>
                        {copied ? <span className="text-xs text-success">Copied</span> : null}
                      </dd>
                    </div>
                  </div>
                  {asset.vehicleNumber ? (
                    <div className="flex items-start gap-3">
                      <Gauge aria-hidden="true" className="mt-0.5 size-5 text-primary" />
                      <div>
                        <dt className="text-text-secondary">Vehicle Number</dt>
                        <dd className="mt-1 font-semibold tabular-nums text-text-primary">
                          {asset.vehicleNumber}
                        </dd>
                      </div>
                    </div>
                  ) : null}
                  <div className="flex items-start gap-3">
                    <CalendarDays aria-hidden="true" className="mt-0.5 size-5 text-primary" />
                    <div>
                      <dt className="text-text-secondary">Added on</dt>
                      <dd className="mt-1 font-semibold text-text-primary">
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(asset.createdAt))}
                      </dd>
                    </div>
                  </div>
                </dl>
              </div>
            </Card>

            <Card className="p-6 md:col-span-7">
              <div className="mb-4 flex items-center gap-2">
                <MapPinned aria-hidden="true" className="size-5 text-primary" />
                <h2 className="font-heading text-lg font-semibold text-text-primary">Live Location</h2>
              </div>
              {location ? <MiniMap location={location} /> : null}
            </Card>

            <Card className="p-6 md:col-span-6">
              <h2 className="font-heading text-lg font-semibold text-text-primary">Asset Control</h2>
              <p className="mt-1 text-sm leading-5 text-text-secondary">
                {asset.status === "locked"
                  ? "This asset is locked and unavailable for operation."
                  : asset.status === "inactive"
                    ? "This inactive asset cannot be controlled."
                    : "This asset is active and currently unlocked."}
              </p>

              {actionError ? (
                <p className="mt-4 rounded-xl bg-error-container p-3 text-sm text-on-error-container" role="alert">
                  {actionError}
                </p>
              ) : null}

              <div
                className={`mt-6 flex items-center gap-4 rounded-2xl p-4 ${
                  asset.status === "locked"
                    ? "bg-error/10 text-error"
                    : asset.status === "inactive"
                      ? "bg-surface-container text-text-secondary"
                      : "bg-success/10 text-primary"
                }`}
              >
                <div className="grid size-12 shrink-0 place-items-center rounded-full bg-white shadow-sm">
                  {asset.status === "locked" ? (
                    <LockKeyhole aria-hidden="true" className="size-6" />
                  ) : (
                    <UnlockKeyhole aria-hidden="true" className="size-6" />
                  )}
                </div>
                <div>
                  <p className="font-semibold">
                    {asset.status === "locked"
                      ? "Asset Locked"
                      : asset.status === "inactive"
                        ? "Asset Inactive"
                        : "Asset Unlocked"}
                  </p>
                  <p className="text-xs opacity-75">Status is persisted securely</p>
                </div>
              </div>

              {confirming ? (
                <div className="mt-5 rounded-2xl border border-outline-variant p-4">
                  <p className="font-semibold text-text-primary">
                    {confirming === "lock" ? "Lock this asset?" : "Unlock this asset?"}
                  </p>
                  <p className="mt-1 text-sm leading-5 text-text-secondary">
                    {confirming === "lock"
                      ? "The asset will become unavailable until you unlock it again."
                      : "The asset will return to active operation."}
                  </p>
                  <div className="mt-4 flex gap-3">
                    <Button
                      loading={actionLoading}
                      onClick={() => void handleLockAction()}
                      variant={confirming === "lock" ? "danger" : "primary"}
                    >
                      Confirm {confirming}
                    </Button>
                    <Button disabled={actionLoading} onClick={() => setConfirming(null)} variant="ghost">
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : asset.status !== "inactive" ? (
                <Button
                  className="mt-5"
                  onClick={() => setConfirming(asset.status === "locked" ? "unlock" : "lock")}
                  variant={asset.status === "locked" ? "primary" : "danger"}
                >
                  {asset.status === "locked" ? (
                    <UnlockKeyhole aria-hidden="true" className="size-5" />
                  ) : (
                    <LockKeyhole aria-hidden="true" className="size-5" />
                  )}
                  {asset.status === "locked" ? "Unlock Asset" : "Lock Asset"}
                </Button>
              ) : null}
            </Card>

            <Card className="p-6 md:col-span-6">
              <h2 className="font-heading text-lg font-semibold text-text-primary">Device Telemetry</h2>
              {asset.batteryLevel !== null || asset.temperature !== null ? (
                <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:justify-around">
                  {asset.batteryLevel !== null ? (
                    <BatteryRing level={asset.batteryLevel} />
                  ) : null}
                  {asset.temperature !== null ? (
                    <div className="flex items-center gap-3 rounded-2xl bg-warning/10 p-4 text-warning">
                      <Thermometer aria-hidden="true" className="size-7" />
                      <div>
                        <p className="text-xs font-medium text-text-secondary">Temperature</p>
                        <p className="mt-1 font-heading text-2xl font-semibold tabular-nums text-text-primary">
                          {asset.temperature.toFixed(1)}°C
                        </p>
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : (
                <div className="mt-5 grid min-h-40 place-items-center rounded-2xl border border-dashed border-outline-variant bg-surface-container-low p-6 text-center">
                  <div>
                    <BatteryCharging aria-hidden="true" className="mx-auto size-8 text-text-secondary" />
                    <p className="mt-3 font-semibold text-text-primary">Telemetry unavailable</p>
                    <p className="mt-1 text-sm text-text-secondary">
                      The device has not reported battery data yet.
                    </p>
                  </div>
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </main>
      <BottomNavigation active="assets" />
    </div>
  );
}
