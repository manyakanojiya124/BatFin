import {
  AlertCircle,
  ArrowRight,
  BatteryCharging,
  Bike,
  QrCode,
  ScanLine,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";

import { Button } from "../../components/Button";
import { TextField } from "../../components/TextField";
import { ApiClientError, createAsset } from "../../services/api";
import { useAuthStore } from "../../store/auth.store";
import type { AssetType } from "../../types/api";

export function AddAssetPage() {
  const navigate = useNavigate();
  const token = useAuthStore((state) => state.token);
  const logout = useAuthStore((state) => state.logout);
  const [assetType, setAssetType] = useState<AssetType>("battery");
  const [serialNumber, setSerialNumber] = useState("");
  const [productType, setProductType] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!token) return;
    if (serialNumber.trim().length < 4) {
      setError("Enter at least 4 characters from the asset serial number.");
      return;
    }
    if (productType.trim().length < 2) {
      setError("Enter the product type printed on the asset.");
      return;
    }

    setLoading(true);
    try {
      const result = await createAsset(token, {
        serialNumber: serialNumber.trim(),
        assetType,
        productType: productType.trim(),
      });
      navigate(`/assets/${result.asset.id}`, { replace: true });
    } catch (requestError) {
      if (requestError instanceof ApiClientError && requestError.status === 401) {
        logout();
        navigate("/login", { replace: true });
        return;
      }
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Unable to add this asset.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#071a14] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-60">
        <div className="absolute -left-28 top-16 size-72 rounded-full bg-primary/25 blur-3xl" />
        <div className="absolute -right-24 bottom-16 size-80 rounded-full bg-secondary/20 blur-3xl" />
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.12) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.12) 1px, transparent 1px)",
            backgroundSize: "32px 32px",
          }}
        />
      </div>

      <header className="relative z-20 flex h-16 items-center justify-between px-4 md:px-8">
        <button
          aria-label="Close asset scanner"
          className="grid size-10 place-items-center rounded-full text-white transition hover:bg-white/10 active:scale-95"
          onClick={() => navigate("/assets")}
          type="button"
        >
          <X aria-hidden="true" className="size-6" />
        </button>
        <h1 className="font-heading text-xl font-semibold">Scan QR Code</h1>
        <div className="size-10" />
      </header>

      <main className="relative z-10 mx-auto flex w-full max-w-5xl flex-col items-center px-4 pb-10 pt-4 md:grid md:min-h-[calc(100vh-4rem)] md:grid-cols-2 md:gap-12 md:px-8 md:py-10">
        <section className="flex w-full flex-col items-center">
          <p className="max-w-sm text-center text-sm leading-6 text-white/75">
            Type or paste the code from the QR label inside the frame to simulate a scan.
          </p>
          <div className="relative mt-7 aspect-square w-full max-w-64 md:max-w-80">
            <div className="absolute left-0 top-0 size-10 rounded-tl-xl border-l-4 border-t-4 border-primary-fixed" />
            <div className="absolute right-0 top-0 size-10 rounded-tr-xl border-r-4 border-t-4 border-primary-fixed" />
            <div className="absolute bottom-0 left-0 size-10 rounded-bl-xl border-b-4 border-l-4 border-primary-fixed" />
            <div className="absolute bottom-0 right-0 size-10 rounded-br-xl border-b-4 border-r-4 border-primary-fixed" />
            <div className="asset-scan-line absolute left-3 right-3 top-3 h-0.5 bg-primary-fixed shadow-[0_0_12px_rgba(127,252,151,.9)]" />
            <div className="absolute inset-0 grid place-items-center">
              <QrCode aria-hidden="true" className="size-24 text-white/15" strokeWidth={1.5} />
            </div>
          </div>
          <div className="mt-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs text-white/75 backdrop-blur">
            <ScanLine aria-hidden="true" className="size-4 text-primary-fixed" />
            QR scan simulation
          </div>
        </section>

        <section className="mt-8 w-full max-w-md rounded-card bg-white p-6 text-on-surface shadow-[0_20px_60px_rgba(0,0,0,.25)] md:mt-0 md:p-8">
          <div className="mb-6">
            <p className="text-sm font-semibold uppercase tracking-wider text-text-secondary">
              Manual details
            </p>
            <h2 className="mt-1 font-heading text-2xl font-semibold text-text-primary">
              Add your asset
            </h2>
          </div>

          {error ? (
            <div
              className="mb-5 flex gap-3 rounded-xl bg-error-container p-3 text-sm text-on-error-container"
              role="alert"
            >
              <AlertCircle aria-hidden="true" className="mt-0.5 size-5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Asset Type</legend>
              <div className="grid grid-cols-2 gap-3">
                {(
                  [
                    ["battery", BatteryCharging, "Battery"],
                    ["vehicle", Bike, "Vehicle"],
                  ] as const
                ).map(([value, Icon, label]) => {
                  const selected = assetType === value;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 px-3 text-sm font-semibold transition ${
                        selected
                          ? "border-success bg-success/10 text-primary"
                          : "border-surface-container bg-white text-on-surface-variant hover:border-outline-variant"
                      }`}
                      key={value}
                      onClick={() => setAssetType(value)}
                      type="button"
                    >
                      <Icon aria-hidden="true" className="size-5" />
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <TextField
              autoCapitalize="characters"
              autoComplete="off"
              id="asset-serial-number"
              label="Serial Number"
              maxLength={64}
              onChange={(event) =>
                setSerialNumber(event.target.value.toUpperCase().replace(/\s/g, ""))
              }
              placeholder="BAT-L5-2026-0001"
              required
              value={serialNumber}
            />
            <TextField
              autoComplete="off"
              id="asset-product-type"
              label="Product Type"
              maxLength={80}
              onChange={(event) => setProductType(event.target.value)}
              placeholder={assetType === "battery" ? "Battery L5" : "2 Wheeler"}
              required
              value={productType}
            />

            <Button fullWidth loading={loading} type="submit">
              Add Asset
              {!loading ? <ArrowRight aria-hidden="true" className="size-4" /> : null}
            </Button>
          </form>
        </section>
      </main>
    </div>
  );
}
