import {
  BatteryMedium,
  ChevronRight,
  PackageOpen,
  Plus,
  RefreshCw,
  ScanLine,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AssetStatusBadge, AssetTypeIcon } from "../../components/AssetVisuals";
import { BottomNavigation } from "../../components/BottomNavigation";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import { ApiClientError, listAssets } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type { Asset } from "../../types/api";

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

function AssetListSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {[0, 1, 2].map((item) => (
        <LoadingSkeleton className="h-36 rounded-card" key={item} />
      ))}
    </div>
  );
}

export function AssetsPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadAssets = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const result = await listAssets(token);
      setAssets(result.assets);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load your assets.",
      );
    } finally {
      setLoading(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    void loadAssets();
  }, [loadAssets]);

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate("/dashboard")}
        title="Assets"
      />
      <main className="page-enter mx-auto w-full max-w-app px-4 py-6 md:px-8 md:py-10">
        <div className="mb-7 flex items-end justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-text-secondary">Manage your fleet</p>
            <h2 className="mt-1 font-heading text-3xl font-semibold text-text-primary">
              Your Assets
            </h2>
          </div>
          <Link
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-success px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-container active:scale-[0.98]"
            to="/assets/add"
          >
            <Plus aria-hidden="true" className="size-5" />
            <span className="hidden sm:inline">Add Asset</span>
          </Link>
        </div>

        {loading ? (
          <AssetListSkeleton />
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h3 className="mt-4 font-heading text-xl font-semibold">Unable to load assets</h3>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadAssets()}>
              Try again
            </Button>
          </Card>
        ) : assets.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary">
              <PackageOpen aria-hidden="true" className="size-8" />
            </div>
            <h3 className="mt-5 font-heading text-2xl font-semibold text-text-primary">
              No assets added yet
            </h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
              Scan or enter the serial number printed on your BatFIN battery or vehicle to connect it to your account.
            </p>
            <Link
              className="mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary-container active:scale-[0.98]"
              to="/assets/add"
            >
              <ScanLine aria-hidden="true" className="size-5" />
              Add your first asset
            </Link>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {assets.map((asset) => (
              <Link className="group block" key={asset.id} to={`/assets/${asset.id}`}>
                <Card className="h-full p-5 transition duration-200 group-hover:-translate-y-0.5 group-hover:shadow-card-hover">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex min-w-0 items-center gap-4">
                      <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                        <AssetTypeIcon assetType={asset.assetType} />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-heading text-lg font-semibold text-text-primary">
                          {asset.productType}
                        </p>
                        <p className="mt-1 truncate text-sm font-medium tabular-nums text-text-secondary">
                          {asset.serialNumber}
                        </p>
                      </div>
                    </div>
                    <AssetStatusBadge status={asset.status} />
                  </div>
                  <div className="mt-5 flex items-center justify-between border-t border-surface-container pt-4">
                    <div className="flex items-center gap-2 text-sm text-text-secondary">
                      {asset.batteryLevel !== null ? (
                        <>
                          <BatteryMedium aria-hidden="true" className="size-4 text-success" />
                          <span className="tabular-nums">{asset.batteryLevel}% charge</span>
                        </>
                      ) : (
                        <span className="capitalize">{asset.assetType}</span>
                      )}
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                      Details
                      <ChevronRight
                        aria-hidden="true"
                        className="size-4 transition group-hover:translate-x-0.5"
                      />
                    </span>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </main>
      <BottomNavigation active="assets" />
    </div>
  );
}
