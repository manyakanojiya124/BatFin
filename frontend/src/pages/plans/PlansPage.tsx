import {
  AlertCircle,
  ArrowRight,
  BatteryCharging,
  CalendarDays,
  Check,
  CreditCard,
  Gauge,
  PackageOpen,
  RefreshCw,
  WalletCards,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { Button } from "../../components/Button";
import { Card } from "../../components/Card";
import { LoadingSkeleton } from "../../components/LoadingSkeleton";
import { PageHeader } from "../../components/PageHeader";
import {
  ApiClientError,
  createSubscription,
  getActiveSubscription,
  listAssets,
  listPlans,
} from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type {
  Asset,
  Plan,
  PlanType,
  Subscription,
} from "../../types/api";

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
    maximumFractionDigits: value % 1 === 0 ? 0 : 2,
  }).format(value);
}

function formatCycle(value: string) {
  return value
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function PlansSkeleton() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((item) => (
        <LoadingSkeleton className="h-72 rounded-card" key={item} />
      ))}
    </div>
  );
}

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: Plan;
  selected: boolean;
  onSelect: () => void;
}) {
  const headlineValue =
    plan.type === "PREPAID" ? plan.minimumBalance : plan.creditLimit;
  const headlineLabel =
    plan.type === "PREPAID" ? "minimum balance" : "credit limit";

  return (
    <button
      aria-pressed={selected}
      className={`flex h-full min-h-72 w-full flex-col rounded-card border-2 bg-white p-5 text-left shadow-card transition duration-200 active:scale-[0.99] sm:p-6 ${
        selected
          ? "border-primary shadow-card-hover"
          : "border-transparent hover:-translate-y-0.5 hover:border-outline-variant"
      }`}
      onClick={onSelect}
      type="button"
    >
      <div className="flex w-full items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
            {formatCycle(plan.billingCycle)} billing
          </p>
          <h3 className="mt-2 truncate font-heading text-2xl font-semibold text-text-primary">
            {plan.name}
          </h3>
        </div>
        <span
          className={`grid size-7 shrink-0 place-items-center rounded-full border-2 transition ${
            selected
              ? "border-primary bg-primary text-white"
              : "border-outline-variant bg-white text-transparent"
          }`}
        >
          <Check aria-hidden="true" className="size-4" strokeWidth={3} />
        </span>
      </div>

      {headlineValue !== null ? (
        <div className="mt-6">
          <p className={`font-heading text-3xl font-semibold tabular-nums ${selected ? "text-primary" : "text-text-primary"}`}>
            {formatCurrency(headlineValue)}
          </p>
          <p className="mt-1 text-sm text-text-secondary">{headlineLabel}</p>
        </div>
      ) : null}

      <div className="mt-auto w-full space-y-3 border-t border-surface-container pt-5 text-sm">
        {plan.pricePerKm !== null ? (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <Gauge aria-hidden="true" className="size-4 text-success" /> Per kilometre
            </span>
            <strong className="tabular-nums text-text-primary">
              {formatCurrency(plan.pricePerKm)}
            </strong>
          </div>
        ) : null}
        {plan.pricePerKwh !== null ? (
          <div className="flex items-center justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-text-secondary">
              <Zap aria-hidden="true" className="size-4 text-success" /> Per kWh
            </span>
            <strong className="tabular-nums text-text-primary">
              {formatCurrency(plan.pricePerKwh)}
            </strong>
          </div>
        ) : null}
        <div className="flex items-center gap-2 text-text-secondary">
          <CalendarDays aria-hidden="true" className="size-4 text-success" />
          {formatCycle(plan.billingCycle)} settlement
        </div>
      </div>
    </button>
  );
}

export function PlansPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [activeSubscription, setActiveSubscription] =
    useState<Subscription | null>(null);
  const [planType, setPlanType] = useState<PlanType>("PREPAID");
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [selectedAssetId, setSelectedAssetId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const filteredPlans = useMemo(() => {
    const cycleOrder: Record<string, number> = {
      DAILY: 1,
      WEEKLY: 2,
      "3_DAYS": 3,
      "7_DAYS": 4,
      "15_DAYS": 5,
      MONTHLY: 6,
      "30_DAYS": 7,
      FLEXIBLE: 8,
    };

    return plans
      .filter((plan) => plan.type === planType)
      .sort(
        (first, second) =>
          (cycleOrder[first.billingCycle] ?? 99) -
          (cycleOrder[second.billingCycle] ?? 99),
      );
  }, [planType, plans]);
  const selectedPlan = plans.find((plan) => plan.id === selectedPlanId) ?? null;
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;
  const selectedAssetHasActivePlan =
    activeSubscription?.assetId === selectedAssetId;

  const loadPage = useCallback(async () => {
    if (!token) return;

    setLoading(true);
    setError("");
    try {
      const [planResult, assetResult, subscriptionResult] = await Promise.all([
        listPlans(),
        listAssets(token),
        getActiveSubscription(token),
      ]);
      setPlans(planResult.plans);
      setAssets(assetResult.assets);
      setActiveSubscription(subscriptionResult.subscription);
      const preferredAsset =
        assetResult.assets.find((asset) => asset.assetType === "battery") ??
        assetResult.assets[0];
      setSelectedAssetId((current) => current || preferredAsset?.id || "");
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to load payment plans.",
      );
    } finally {
      setLoading(false);
    }
  }, [logout, navigate, token]);

  useEffect(() => {
    void loadPage();
  }, [loadPage]);

  useEffect(() => {
    if (!filteredPlans.some((plan) => plan.id === selectedPlanId)) {
      setSelectedPlanId(filteredPlans[0]?.id ?? "");
    }
  }, [filteredPlans, selectedPlanId]);

  useEffect(() => {
    if (!notice) return;
    const timeout = window.setTimeout(() => setNotice(""), 5000);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  async function handleSubscribe() {
    if (!token || !selectedAssetId || !selectedPlanId) return;

    setSubmitting(true);
    setActionError("");
    try {
      const result = await createSubscription(token, {
        assetId: selectedAssetId,
        planId: selectedPlanId,
      });
      setActiveSubscription(result.subscription);
      setNotice(`${result.subscription.plan.name} is now active for ${result.subscription.asset.productType}.`);
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setActionError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to activate this plan.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background pb-40">
      <PageHeader
        initials={initials(user?.name ?? "BatFIN User")}
        onBack={() => navigate("/dashboard")}
        title="BatFIN"
      />
      <main className="page-enter mx-auto w-full max-w-app px-4 py-6 sm:px-6 md:px-8 md:py-10">
        <div className="mb-7">
          <p className="text-sm font-medium text-text-secondary">Flexible battery leasing</p>
          <h1 className="mt-1 font-heading text-3xl font-semibold text-text-primary sm:text-4xl">
            Select Payment Plan
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary sm:text-base">
            Choose the option that works best for your asset and usage.
          </p>
        </div>

        {loading ? (
          <div className="space-y-6">
            <LoadingSkeleton className="h-12 rounded-xl" />
            <PlansSkeleton />
          </div>
        ) : error ? (
          <Card className="p-8 text-center">
            <RefreshCw aria-hidden="true" className="mx-auto size-9 text-error" />
            <h2 className="mt-4 font-heading text-xl font-semibold">Unable to load plans</h2>
            <p className="mt-2 text-sm text-text-secondary">{error}</p>
            <Button className="mt-6" onClick={() => void loadPage()}>
              Try again
            </Button>
          </Card>
        ) : assets.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <PackageOpen aria-hidden="true" className="mx-auto size-10 text-primary" />
            <h2 className="mt-4 font-heading text-2xl font-semibold">Add an asset first</h2>
            <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-text-secondary">
              A payment plan must be linked to one of your registered assets.
            </p>
            <Link
              className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-xl bg-success px-5 py-3 text-sm font-semibold text-white"
              to="/assets/add"
            >
              Add Asset <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </Card>
        ) : plans.length === 0 ? (
          <Card className="px-6 py-12 text-center">
            <CreditCard aria-hidden="true" className="mx-auto size-10 text-text-secondary" />
            <h2 className="mt-4 font-heading text-2xl font-semibold">No plans available</h2>
            <p className="mt-2 text-sm text-text-secondary">
              There are currently no active plans for selection.
            </p>
          </Card>
        ) : (
          <>
            {notice ? (
              <div className="mb-6 flex items-start gap-3 rounded-xl bg-success/10 p-4 text-sm font-medium text-primary" role="status">
                <Check aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
                {notice}
              </div>
            ) : null}

            {activeSubscription ? (
              <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-3">
                  <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <WalletCards aria-hidden="true" className="size-5" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary">
                      Current active plan
                    </p>
                    <p className="mt-1 font-semibold text-text-primary">
                      {activeSubscription.plan.name} · {activeSubscription.asset.productType}
                    </p>
                  </div>
                </div>
                <span className="self-start rounded-full bg-success/10 px-3 py-1 text-xs font-semibold text-primary sm:self-auto">
                  Active
                </span>
              </Card>
            ) : null}

            <div className="mb-6 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
              <div>
                <label className="mb-2 block text-sm font-medium text-on-surface" htmlFor="plan-asset">
                  Apply plan to
                </label>
                <div className="relative">
                  <BatteryCharging className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-primary" />
                  <select
                    className="min-h-12 w-full appearance-none rounded-xl border-[1.5px] border-outline-variant bg-white py-3 pl-12 pr-10 text-base font-medium text-text-primary outline-none transition focus:border-success focus:shadow-[0_0_0_3px_rgba(22,163,74,.14)]"
                    id="plan-asset"
                    onChange={(event) => {
                      setSelectedAssetId(event.target.value);
                      setActionError("");
                    }}
                    value={selectedAssetId}
                  >
                    {assets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.productType} · {asset.serialNumber}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {selectedAsset ? (
                <p className="text-sm text-text-secondary lg:pb-3">
                  Status: <span className="font-semibold capitalize text-text-primary">{selectedAsset.status}</span>
                </p>
              ) : null}
            </div>

            <div className="mb-8 flex rounded-xl bg-surface-container-highest p-1" role="tablist" aria-label="Plan type">
              {(["PREPAID", "POSTPAID"] as PlanType[]).map((type) => {
                const selected = planType === type;
                return (
                  <button
                    aria-selected={selected}
                    className={`min-h-11 flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition ${
                      selected
                        ? "bg-white text-primary shadow-card"
                        : "text-text-secondary hover:text-text-primary"
                    }`}
                    key={type}
                    onClick={() => {
                      setPlanType(type);
                      setActionError("");
                    }}
                    role="tab"
                    type="button"
                  >
                    {type === "PREPAID" ? "Prepaid" : "Postpaid"}
                  </button>
                );
              })}
            </div>

            {filteredPlans.length > 0 ? (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {filteredPlans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    onSelect={() => {
                      setSelectedPlanId(plan.id);
                      setActionError("");
                    }}
                    plan={plan}
                    selected={selectedPlanId === plan.id}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <p className="font-semibold text-text-primary">No {planType.toLowerCase()} plans available</p>
              </Card>
            )}

            {actionError ? (
              <div className="mt-6 flex gap-3 rounded-xl bg-error-container p-4 text-sm text-on-error-container" role="alert">
                <AlertCircle aria-hidden="true" className="size-5 shrink-0" />
                {actionError}
              </div>
            ) : null}
          </>
        )}
      </main>

      {!loading && !error && assets.length > 0 && plans.length > 0 ? (
        <div className="safe-bottom fixed inset-x-0 bottom-0 z-50 border-t border-surface-container-highest bg-white/95 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,.06)] backdrop-blur sm:px-6">
          <div className="mx-auto flex w-full max-w-app flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 text-center sm:text-left">
              <p className="truncate text-sm font-semibold text-text-primary">
                {selectedPlan?.name ?? "Select a plan"}
              </p>
              <p className="truncate text-xs text-text-secondary">
                {selectedAsset?.productType ?? "Select an asset"}
              </p>
            </div>
            <Button
              className="w-full sm:w-auto sm:min-w-64"
              disabled={!selectedPlan || !selectedAsset || selectedAssetHasActivePlan}
              loading={submitting}
              onClick={() => void handleSubscribe()}
            >
              {selectedAssetHasActivePlan ? "Plan Already Active" : "Activate Plan"}
              {!submitting && !selectedAssetHasActivePlan ? (
                <ArrowRight aria-hidden="true" className="size-4" />
              ) : null}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
