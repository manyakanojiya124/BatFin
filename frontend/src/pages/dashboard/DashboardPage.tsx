import {
  ArrowRight,
  BatteryMedium,
  ClipboardList,
  HeartPulse,
  LifeBuoy,
  Mail,
  MapPin,
  Plus,
  ReceiptText,
  RefreshCw,
  ScanLine,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { AssetStatusBadge, AssetTypeIcon } from "../../components/AssetVisuals";
import { BottomNavigation } from "../../components/BottomNavigation";
import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import { PortfolioFinanceSection } from "../../components/PortfolioFinanceSection";
import {
  ApiClientError,
  getLedgerSummary,
  getMe,
  listAssets,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type { Asset, LedgerSummary } from "../../types/api";

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

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function DashboardPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const logout = useAuthStore((state) => state.logout);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [ledgerSummary, setLedgerSummary] = useState<LedgerSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const [profileResult, assetsResult, ledgerResult] = await Promise.all([
        getMe(token),
        listAssets(token),
        getLedgerSummary(token),
      ]);
      setUser(profileResult.user);
      setAssets(assetsResult.assets);
      setLedgerSummary(ledgerResult.summary);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load your dashboard.",
      );
    } finally {
      setLoading(false);
    }
  }, [logout, navigate, setUser, token]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const primaryAsset =
    assets.find((asset) => asset.assetType === "battery") ?? assets[0] ?? null;
  const displayInitials = initials(user?.name ?? "BatFIN User");

  return (
    <div className="min-h-screen bg-background pb-24 md:pb-10">
      <PageHeader initials={displayInitials} title="BatFIN" />
      <main className="mx-auto w-full max-w-app px-4 py-8 md:px-8 md:py-12">
        {loading ? (
          <div className="space-y-6" aria-label="Loading dashboard">
            <LoadingSkeleton className="h-10 w-64" />
            <div className="grid gap-6 md:grid-cols-12">
              <LoadingSkeleton className="h-56 rounded-card md:col-span-8" />
              <LoadingSkeleton className="h-56 rounded-card md:col-span-4" />
            </div>
            <LoadingSkeleton className="h-40 rounded-card" />
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load dashboard</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadDashboard()}>
              Try again
            </Button>
          </Card>
        ) : user ? (
          <div className="page-enter space-y-7">
            <section>
              <p className="text-sm font-medium text-text-secondary">Welcome back</p>
              <h2 className="mt-1 font-heading text-3xl font-semibold text-text-primary md:text-4xl">
                Hello, {user.name.split(" ")[0]}
              </h2>
            </section>

            <div className="grid gap-6 md:grid-cols-12">
              <Card className="relative overflow-hidden p-6 md:col-span-8 md:p-8" tone="dark">
                <div className="absolute -right-10 -top-12 size-48 rounded-full bg-success/20 blur-3xl" />
                <div className="relative z-10 flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-tertiary-fixed-dim">
                        Available Wallet Balance
                      </p>
                      <h3 className="mt-2 break-words font-heading text-4xl font-semibold tabular-nums sm:text-5xl">
                        {formatCurrency(ledgerSummary?.currentBalance ?? 0)}
                      </h3>
                    </div>
                    <div className="grid size-12 shrink-0 place-items-center rounded-2xl bg-white/10 text-primary-fixed">
                      <ReceiptText aria-hidden="true" className="size-7" />
                    </div>
                  </div>
                  <div>
                    <p className="mt-5 text-sm text-white/70">
                      This month: {formatCurrency(ledgerSummary?.thisMonth.net ?? 0)} net
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <Link
                        className="inline-flex items-center gap-2 rounded-xl bg-primary-container px-5 py-3 text-sm font-semibold text-white transition hover:bg-primary active:scale-[0.98]"
                        to="/ledger"
                      >
                        View Ledger
                        <ArrowRight aria-hidden="true" className="size-4" />
                      </Link>
                      <Link
                        className="inline-flex items-center gap-2 rounded-xl border border-white/25 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
                        to="/assets"
                      >
                        View Assets
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              {primaryAsset ? (
                <Link className="group md:col-span-4" to={`/assets/${primaryAsset.id}`}>
                  <Card className="flex h-full min-h-56 flex-col justify-between p-6 transition group-hover:-translate-y-0.5 group-hover:shadow-card-hover">
                    <div className="flex items-start justify-between gap-3">
                      <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                        <AssetTypeIcon assetType={primaryAsset.assetType} />
                      </div>
                      <AssetStatusBadge status={primaryAsset.status} />
                    </div>
                    <div className="mt-6">
                      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                        Primary Asset
                      </p>
                      <h3 className="mt-2 truncate font-heading text-xl font-semibold text-text-primary">
                        {primaryAsset.productType}
                      </h3>
                      <p className="mt-1 truncate text-sm tabular-nums text-text-secondary">
                        {primaryAsset.serialNumber}
                      </p>
                      <div className="mt-4 flex items-center justify-between">
                        {primaryAsset.batteryLevel !== null ? (
                          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
                            <BatteryMedium aria-hidden="true" className="size-4" />
                            {primaryAsset.batteryLevel}%
                          </span>
                        ) : (
                          <span className="text-sm capitalize text-text-secondary">
                            {primaryAsset.assetType}
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 text-sm font-semibold text-primary">
                          Details <ArrowRight aria-hidden="true" className="size-4" />
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              ) : (
                <Card className="flex min-h-56 flex-col items-center justify-center p-6 text-center md:col-span-4">
                  <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <ScanLine aria-hidden="true" className="size-6" />
                  </div>
                  <h3 className="mt-4 font-heading text-lg font-semibold">Connect your first asset</h3>
                  <p className="mt-1 text-sm leading-5 text-text-secondary">
                    Add a battery or vehicle by serial number.
                  </p>
                  <Link
                    className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                    to="/assets/add"
                  >
                    <Plus aria-hidden="true" className="size-4" /> Add Asset
                  </Link>
                </Card>
              )}
            </div>

            {token?<PortfolioFinanceSection token={token}/>:null}

            <section>
              <h3 className="font-heading text-xl font-semibold text-text-primary">Quick Actions</h3>
              <div className="mt-4 grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
                <Link className="group" to="/assets">
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                      <AssetTypeIcon assetType="battery" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Assets</p>
                      <p className="text-xs text-text-secondary">View and control</p>
                    </div>
                  </Card>
                </Link>
                <Link className="group" to="/assets/add">
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-secondary/10 text-secondary">
                      <ScanLine aria-hidden="true" className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Add Asset</p>
                      <p className="text-xs text-text-secondary">QR or manual</p>
                    </div>
                  </Card>
                </Link>
                <Link className="group" to="/plans">
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-success/10 text-primary">
                      <ClipboardList aria-hidden="true" className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Plans</p>
                      <p className="text-xs text-text-secondary">Choose billing</p>
                    </div>
                  </Card>
                </Link>
                <Link
                  className="group"
                  to={primaryAsset ? `/assets/${primaryAsset.id}/health` : "/assets"}
                >
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-error/10 text-error">
                      <HeartPulse aria-hidden="true" className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Health</p>
                      <p className="text-xs text-text-secondary">
                        {primaryAsset ? "Device status" : "Add asset first"}
                      </p>
                    </div>
                  </Card>
                </Link>
                <Link className="group" to="/payments">
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-secondary/10 text-secondary">
                      <WalletCards aria-hidden="true" className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Payments</p>
                      <p className="text-xs text-text-secondary">Recharge wallet</p>
                    </div>
                  </Card>
                </Link>
                <Link className="group" to="/ledger">
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-warning/10 text-warning">
                      <ReceiptText aria-hidden="true" className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Ledger</p>
                      <p className="text-xs text-text-secondary">Transactions</p>
                    </div>
                  </Card>
                </Link>
                <Link className="group" to="/support">
                  <Card className="flex items-center gap-4 p-4 transition group-hover:shadow-card-hover">
                    <div className="grid size-12 place-items-center rounded-2xl bg-tertiary-fixed text-on-primary-fixed">
                      <LifeBuoy aria-hidden="true" className="size-6" />
                    </div>
                    <div>
                      <p className="font-semibold text-text-primary">Support</p>
                      <p className="text-xs text-text-secondary">Create ticket</p>
                    </div>
                  </Card>
                </Link>
              </div>
            </section>

            <Card className="p-6">
              <div className="flex items-center gap-3">
                <div className="grid size-11 place-items-center rounded-full bg-surface-container text-on-surface-variant">
                  <UserRound aria-hidden="true" className="size-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-text-primary">Personal Information</h3>
                  <p className="text-sm text-text-secondary">Stored securely</p>
                </div>
              </div>
              <dl className="mt-6 grid gap-4 text-sm md:grid-cols-2">
                <div className="flex items-start gap-3">
                  <Mail aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <dt className="text-text-secondary">Email</dt>
                    <dd className="mt-0.5 font-medium text-text-primary">
                      {user.email ?? "Not added yet"}
                    </dd>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-primary" />
                  <div>
                    <dt className="text-text-secondary">Address</dt>
                    <dd className="mt-0.5 font-medium text-text-primary">
                      {user.address ?? "Not added yet"}
                    </dd>
                  </div>
                </div>
              </dl>
            </Card>
          </div>
        ) : null}
      </main>
      <BottomNavigation active="home" />
    </div>
  );
}
